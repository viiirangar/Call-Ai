package com.myfrenchassistant.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.telephony.TelephonyManager
import android.telecom.TelecomManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Quand un appel arrive :
 * 1) si l'application est activée et les réglages complets
 * 2) demande au serveur si la réponse d'appel est activée (4 s maximum)
 * 3) décroche automatiquement et démarre le service de conversation
 * Sinon, l'application n'intervient pas et le téléphone sonne normalement.
 */
class CallStateReceiver : BroadcastReceiver() {

    companion object {
        @Volatile
        var busyForNumber: String? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> return // après le démarrage, ouvrir l'application suffit
        }

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        if (state != TelephonyManager.EXTRA_STATE_RINGING) return
        if (!Prefs.enabled(context) || !Prefs.isConfigured(context)) return

        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: ""
        // Évite de traiter deux fois la même sonnerie
        if (busyForNumber != null) return
        busyForNumber = number

        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Thread.sleep(1200) // petite pause pour laisser la sonnerie se stabiliser

                val check = ApiClient.startCall(context, callId = "precheck-${System.currentTimeMillis()}")
                if (!check.ok || check.disabled) return@launch // serveur injoignable ou réponse d'appel désactivée

                // Réveille l'écran pour que la décrochée et l'écoute fonctionnent sur tous les téléphones
                wakeScreen(context)

                answerCall(context)

                val service = Intent(context, CallSessionService::class.java)
                service.putExtra("callId", "call-${System.currentTimeMillis()}")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(service)
                } else {
                    context.startService(service)
                }
            } catch (_: Exception) {
                // Rien — le téléphone sonne normalement
            } finally {
                busyForNumber = null
                pending.finish()
            }
        }
    }

    /** Allume l'écran même si le téléphone est verrouillé (15 s, le temps que le service de conversation prenne le relais) */
    @Suppress("DEPRECATION")
    private fun wakeScreen(ctx: Context) {
        try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            val wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "MyFrenchAssistant:Ring"
            )
            wl.acquire(15_000L)
        } catch (_: Exception) {
            // Si le réveil échoue, on continue sans
        }
    }

    @Suppress("DEPRECATION")
    private fun answerCall(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            if (ctx.checkSelfPermission(android.Manifest.permission.ANSWER_PHONE_CALLS)
                == android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                tm.acceptRingingCall()
            }
        }
    }
}
