package com.myfrenchassistant.call

import android.content.Context

/** Stockage des réglages de l'application — adresse du serveur, code de sécurité et état d'activation */
object Prefs {
    private const val FILE = "callbot_prefs"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun serverUrl(ctx: Context): String = prefs(ctx).getString("server_url", "")?.trim()?.trimEnd('/') ?: ""
    fun token(ctx: Context): String = prefs(ctx).getString("api_token", "")?.trim() ?: ""
    fun enabled(ctx: Context): Boolean = prefs(ctx).getBoolean("enabled", true)

    fun save(ctx: Context, serverUrl: String, token: String, enabled: Boolean) {
        prefs(ctx).edit()
            .putString("server_url", serverUrl.trim().trimEnd('/'))
            .putString("api_token", token.trim())
            .putBoolean("enabled", enabled)
            .apply()
    }

    fun setEnabled(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean("enabled", enabled).apply()
    }

    fun isConfigured(ctx: Context): Boolean =
        serverUrl(ctx).startsWith("http") && token(ctx).isNotEmpty()
}
