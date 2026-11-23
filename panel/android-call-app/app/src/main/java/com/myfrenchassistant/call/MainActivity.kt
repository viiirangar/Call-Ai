package com.myfrenchassistant.call

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Écran des réglages de l'application :
 * - adresse du serveur (même adresse que le panneau)
 * - code de sécurité des appels (depuis l'onglet « Appels téléphoniques » du panneau)
 * - interrupteur activé/désactivé
 * - boutons des autorisations et test de connexion
 */
class MainActivity : AppCompatActivity() {

    private val permissionCodes = arrayOf(
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.ANSWER_PHONE_CALLS,
        Manifest.permission.RECORD_AUDIO
    )

    private lateinit var etServer: EditText
    private lateinit var etToken: EditText
    private lateinit var swEnabled: Switch
    private lateinit var tvStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        etServer = findViewById(R.id.etServer)
        etToken = findViewById(R.id.etToken)
        swEnabled = findViewById(R.id.swEnabled)
        tvStatus = findViewById(R.id.tvStatus)

        etServer.setText(Prefs.serverUrl(this))
        etToken.setText(Prefs.token(this))
        swEnabled.isChecked = Prefs.enabled(this)

        findViewById<Button>(R.id.btnSave).setOnClickListener {
            val url = etServer.text.toString().trim()
            val token = etToken.text.toString().trim()
            if (!url.startsWith("http")) {
                toast("L'adresse du serveur doit commencer par http ou https")
                return@setOnClickListener
            }
            if (token.isEmpty()) {
                toast("Copiez le code de sécurité depuis le panneau")
                return@setOnClickListener
            }
            Prefs.save(this, url, token, swEnabled.isChecked)
            toast("Enregistré")
            refreshStatus()
        }

        findViewById<Button>(R.id.btnPermissions).setOnClickListener { askPermissions() }
        findViewById<Button>(R.id.btnBattery).setOnClickListener { askBatteryOptimization() }

        findViewById<Button>(R.id.btnTest).setOnClickListener {
            val url = etServer.text.toString().trim()
            val token = etToken.text.toString().trim()
            if (!url.startsWith("http") || token.isEmpty()) {
                toast("Saisissez d'abord l'adresse du serveur et le code de sécurité")
                return@setOnClickListener
            }
            Prefs.save(this, url, token, swEnabled.isChecked)
            tvStatus.text = "Test de connexion au serveur en cours..."
            CoroutineScope(Dispatchers.IO).launch {
                val res = ApiClient.startCall(this@MainActivity, "test-${System.currentTimeMillis()}")
                runOnUiThread {
                    when {
                        res.disabled -> tvStatus.text = "Le serveur est joignable mais la réponse d'appel est désactivée dans le panneau"
                        res.ok -> tvStatus.text = "Connexion réussie. Message d'accueil du serveur :\n${res.greeting ?: "-"}"
                        else -> tvStatus.text = "Échec de la connexion : ${res.error ?: "erreur inconnue"}"
                    }
                }
            }
        }

        swEnabled.setOnCheckedChangeListener { _, checked ->
            Prefs.setEnabled(this, checked)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 200)
            }
        }
        refreshStatus()
    }

    private fun askPermissions() {
        val missing = permissionCodes.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            toast("Toutes les autorisations ont déjà été accordées")
            refreshStatus()
            return
        }
        ActivityCompat.requestPermissions(this, missing.toTypedArray(), 100)
    }

    private fun askBatteryOptimization() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (pm.isIgnoringBatteryOptimizations(packageName)) {
                toast("Déjà exclu de l'optimisation de la batterie")
                return
            }
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:$packageName"))
            startActivity(intent)
        } catch (e: Exception) {
            toast("Ce réglage n'est pas disponible sur votre téléphone")
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 100) refreshStatus()
    }

    private fun refreshStatus() {
        val sb = StringBuilder()
        sb.append("État des autorisations :\n")
        permissionCodes.forEach { p ->
            val name = when (p) {
                Manifest.permission.READ_PHONE_STATE -> "Détection des appels entrants"
                Manifest.permission.ANSWER_PHONE_CALLS -> "Répondre aux appels"
                Manifest.permission.RECORD_AUDIO -> "Microphone"
                else -> p
            }
            val ok = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED
            sb.append(if (ok) "  • $name : accordée\n" else "  • $name : refusée\n")
        }
        if (!Prefs.isConfigured(this)) sb.append("\nConfiguration incomplète — saisissez l'adresse du serveur et le code de sécurité")
        else sb.append("\nPrêt à répondre")
        tvStatus.text = sb.toString()
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }
}
