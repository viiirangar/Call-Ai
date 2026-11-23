package com.myfrenchassistant.call

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Communication avec le serveur du panneau — point de terminaison /api/call/turn */
object ApiClient {

    data class CallResult(
        val ok: Boolean,
        val greeting: String? = null,
        val reply: String? = null,
        val goodbye: String? = null,
        val disabled: Boolean = false,
        val error: String? = null,
        val audioBase64: String? = null,
        val audioFormat: String? = null
    )

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private suspend fun post(
        ctx: android.content.Context,
        callId: String,
        action: String,
        text: String? = null
    ): CallResult = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("token", Prefs.token(ctx))
                put("callId", callId)
                put("action", action)
                if (!text.isNullOrBlank()) put("text", text)
                put("callerName", "Caller")
            }
            val req = Request.Builder()
                .url(Prefs.serverUrl(ctx) + "/api/call/turn")
                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
            client.newCall(req).execute().use { res ->
                val str = res.body?.string() ?: ""
                if (!res.isSuccessful) {
                    return@use CallResult(ok = false, error = "HTTP ${res.code}")
                }
                val json = JSONObject(str)
                if (!json.optBoolean("ok", false)) {
                    return@use CallResult(ok = false, error = json.optString("error", "Erreur du serveur"))
                }
                CallResult(
                    ok = true,
                    greeting = json.optString("greeting", "").ifEmpty { null },
                    reply = json.optString("reply", "").ifEmpty { null },
                    goodbye = json.optString("goodbye", "").ifEmpty { null },
                    disabled = json.optBoolean("disabled", false),
                    audioBase64 = json.optString("audioBase64", "").ifEmpty { null },
                    audioFormat = json.optString("audioFormat", "").ifEmpty { null }
                )
            }
        } catch (e: Exception) {
            CallResult(ok = false, error = e.message ?: "Erreur réseau")
        }
    }

    suspend fun startCall(ctx: android.content.Context, callId: String) = post(ctx, callId, "start")
    suspend fun turn(ctx: android.content.Context, callId: String, text: String) = post(ctx, callId, "turn", text)
    suspend fun endCall(ctx: android.content.Context, callId: String) = post(ctx, callId, "end")
}
