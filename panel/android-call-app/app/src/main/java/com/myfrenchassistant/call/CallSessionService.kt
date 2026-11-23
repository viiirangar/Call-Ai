package com.myfrenchassistant.call

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.util.Locale

/**
 * Service de conversation d'appel — cœur de l'application :
 * 1) active le haut-parleur
 * 2) récupère et diffuse le message d'accueil en français depuis le serveur
 * 3) boucle : écoute de la question de l'appelant → envoi au serveur → diffusion de la réponse en français
 * 4) après deux silences consécutifs ou la fin de l'appel, salue et raccroche
 */
class CallSessionService : Service() {

    companion object {
        private const val CHANNEL_ID = "callbot_channel"
        private const val NOTIF_ID = 1
        private const val MAX_TURNS = 40
        private const val LISTEN_TIMEOUT_MS = 12_000L
        private const val MAX_CONSECUTIVE_SILENCE = 2
        // Durée maximale de maintien de l'écran allumé : 40 tours × (12 s écoute + 20 s parole) + marge
        private const val SCREEN_WAKE_TIMEOUT_MS = 25 * 60_000L
    }

    private val scope = CoroutineScope(Dispatchers.Default + Job())
    private lateinit var audioManager: AudioManager
    private var tts: TextToSpeech? = null
    private var ttsReady = CompletableDeferred<Boolean>()
    private var recognizer: SpeechRecognizer? = null
    private var callId: String = ""
    private var sessionActive = false

    private var lastRecognition: CompletableDeferred<String?>? = null
    private var lastUtterance: CompletableDeferred<Boolean>? = null
    private var screenWake: PowerManager.WakeLock? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    // Détecte la fin de l'appel à l'initiative du correspondant
    private val phoneStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            val st = intent?.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
            if (st == TelephonyManager.EXTRA_STATE_IDLE && sessionActive) {
                sessionActive = false
                lastRecognition?.complete(null)
                lastUtterance?.complete(true)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        callId = intent?.getStringExtra("callId") ?: "call-${System.currentTimeMillis()}"
        startInForeground()
        registerReceiver(phoneStateReceiver, IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED))

        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        sessionActive = true

        initTts()
        initRecognizer()

        scope.launch { runSession() }
        return START_NOT_STICKY
    }

    private fun startInForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Répondeur d'appel", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Assistant Français")
            .setContentText("Répondeur d'appel actif")
            .setSmallIcon(R.drawable.ic_stat_call)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    // ---------- TTS ----------
    private fun initTts() {
        ttsReady = CompletableDeferred()
        tts = TextToSpeech(this) { status ->
            val ok = status == TextToSpeech.SUCCESS
            if (ok) {
                val fr = Locale.FRANCE
                val res = tts?.setLanguage(fr)
                if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts?.setLanguage(Locale.CANADA_FRENCH)
                }
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) {
                        lastUtterance?.complete(true)
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        lastUtterance?.complete(true)
                    }
                })
            }
            ttsReady.complete(ok)
        }
    }

    private suspend fun speak(text: String, audioBase64: String? = null, audioFormat: String? = null) {
        if (text.isBlank()) return
        // D'abord l'audio préparé par le serveur (voix professionnelle/clonée) — sinon, TTS local du téléphone
        if (!audioBase64.isNullOrBlank() && speakServerAudio(audioBase64, audioFormat ?: "wav")) return
        val ok = ttsReady.await()
        if (!ok) return
        val done = CompletableDeferred<Boolean>()
        lastUtterance = done
        val id = "utt-${System.currentTimeMillis()}"
        mainHandler.post {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
        }
        // 20 secondes maximum par phrase
        withTimeoutOrNull(20_000L) { done.await() }
    }

    /** Diffuse l'audio préparé depuis le serveur — true si la lecture est complète */
    private suspend fun speakServerAudio(base64: String, format: String): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
                if (bytes.size < 100) return@withContext false
                val file = File(cacheDir, "assistant_reply.${format.ifBlank { "wav" }}")
                file.writeBytes(bytes)
                val done = CompletableDeferred<Boolean>()
                withContext(Dispatchers.Main) {
                    val player = android.media.MediaPlayer()
                    player.setAudioAttributes(
                        android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    player.setDataSource(file.absolutePath)
                    player.setOnCompletionListener { mp -> done.complete(true); mp.release() }
                    player.setOnErrorListener { mp, _, _ -> done.complete(true); mp.release(); true }
                    player.prepare()
                    player.start()
                }
                // 25 secondes maximum pour chaque réponse audio
                withTimeoutOrNull(25_000L) { done.await() } == true
            } catch (_: Exception) {
                false
            }
        }

    // ---------- SpeechRecognizer ----------
    private fun initRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return
        mainHandler.post {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this)
            recognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: android.os.Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) {
                    lastRecognition?.complete(null)
                }
                override fun onResults(results: android.os.Bundle?) {
                    val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    lastRecognition?.complete(list?.firstOrNull()?.trim()?.ifEmpty { null })
                }
                override fun onPartialResults(partialResults: android.os.Bundle?) {}
                override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
            })
        }
    }

    /** Écoute pendant LIMIT_MS ; retourne le texte entendu, sinon null */
    private suspend fun listenOnce(): String? {
        if (recognizer == null) return null
        val def = CompletableDeferred<String?>()
        lastRecognition = def
        mainHandler.post {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
            }
            try {
                recognizer?.startListening(intent)
            } catch (_: Exception) {
                def.complete(null)
            }
        }
        val heard = withTimeoutOrNull(LISTEN_TIMEOUT_MS) { def.await() }
        mainHandler.post { try { recognizer?.stopListening() } catch (_: Exception) {} }
        // Si l'écoute est encore ouverte, la fermer
        if (!def.isCompleted) def.complete(null)
        return heard
    }

    // ---------- Boucle principale de conversation ----------
    private suspend fun runSession() {
        try {
            waitForOffhook()
            if (!sessionActive) return

            // Haut-parleur activé — le son sortant passe du haut-parleur au microphone et l'appelant l'entend
            mainHandler.post {
                try {
                    audioManager.mode = AudioManager.MODE_IN_CALL
                    audioManager.isSpeakerphoneOn = true
                } catch (_: Exception) {}
            }

            // L'écran reste allumé pendant toute la conversation — le microphone et la reconnaissance vocale posent problème sur l'écran verrouillé
            keepScreenOnForCall()

            val start = ApiClient.startCall(applicationContext, callId)
            if (!start.ok) {
                // Serveur injoignable — on laisse l'appel et on quitte
                hangUp()
                return
            }
            if (start.disabled) {
                hangUp()
                return
            }

            speak(start.greeting ?: "Bonjour ! Je vous écoute.", start.audioBase64, start.audioFormat)

            var consecutiveSilence = 0
            var consecutiveErrors = 0
            var saidGoodbye = false

            for (turn in 1..MAX_TURNS) {
                if (!sessionActive) break

                val heard = listenOnce()
                if (!sessionActive) break

                if (heard.isNullOrBlank()) {
                    consecutiveSilence++
                    if (consecutiveSilence >= MAX_CONSECUTIVE_SILENCE) break
                    continue
                }
                consecutiveSilence = 0

                val res = ApiClient.turn(applicationContext, callId, heard)
                if (!sessionActive) break

                if (!res.ok) {
                    consecutiveErrors++
                    if (consecutiveErrors >= 2) break
                    speak("Un instant s'il vous plaît.")
                    continue
                }
                consecutiveErrors = 0

                if (res.reply != null) speak(res.reply, res.audioBase64, res.audioFormat)
            }

            if (sessionActive) {
                val end = ApiClient.endCall(applicationContext, callId)
                speak(end.goodbye ?: "Merci pour votre appel, très bonne journée !", end.audioBase64, end.audioFormat)
                saidGoodbye = true
            }
            if (saidGoodbye || sessionActive) hangUp()
        } catch (_: Exception) {
            try { hangUp() } catch (_: Exception) {}
        } finally {
            cleanup()
        }
    }

    /** Réveille l'écran et le garde allumé jusqu'à la fin de la conversation, même si le téléphone est verrouillé */
    @Suppress("DEPRECATION")
    private fun keepScreenOnForCall() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            screenWake = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "MyFrenchAssistant:CallSession"
            )
            screenWake?.acquire(SCREEN_WAKE_TIMEOUT_MS)
        } catch (_: Exception) {
            // On continue sans — inutile sur certains téléphones
        }
    }

    @Suppress("DEPRECATION")
    private suspend fun waitForOffhook() {
        val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        var waited = 0L
        while (waited < 20_000L) {
            if (!sessionActive) return
            if (tm.callState == TelephonyManager.CALL_STATE_OFFHOOK) return
            delay(300)
            waited += 300
        }
        sessionActive = false
    }

    private fun hangUp() {
        try {
            val tm = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            if (checkSelfPermission(android.Manifest.permission.ANSWER_PHONE_CALLS)
                == android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                tm.endCall()
            }
        } catch (_: Exception) {}
    }

    private fun cleanup() {
        sessionActive = false
        try {
            screenWake?.let { if (it.isHeld) it.release() }
        } catch (_: Exception) {}
        screenWake = null
        mainHandler.post {
            try {
                audioManager.isSpeakerphoneOn = false
                audioManager.mode = AudioManager.MODE_NORMAL
            } catch (_: Exception) {}
            try { recognizer?.destroy() } catch (_: Exception) {}
            recognizer = null
            try { tts?.stop() } catch (_: Exception) {}
            try { tts?.shutdown() } catch (_: Exception) {}
            tts = null
        }
        try { unregisterReceiver(phoneStateReceiver) } catch (_: Exception) {}
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
