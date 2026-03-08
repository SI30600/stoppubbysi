package fr.solutioninformatique.stoppubbysi

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.SharedPreferences
import android.database.Cursor
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class CallBlockerService : CallScreeningService() {

    private val TAG = "CallBlockerService"
    private val CHANNEL_ID = "call_blocker_channel"
    
    private lateinit var prefs: SharedPreferences
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val handler = Handler(Looper.getMainLooper())
    private var audioManager: AudioManager? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "CallBlockerService created")
        prefs = getSharedPreferences("call_blocker_prefs", Context.MODE_PRIVATE)
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        createNotificationChannel()
        initTTS()
    }

    private fun initTTS() {
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale.FRENCH)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts?.setLanguage(Locale.getDefault())
                }
                ttsReady = true
                Log.d(TAG, "TTS initialized")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        tts?.stop()
        tts?.shutdown()
    }

    override fun onScreenCall(callDetails: Call.Details) {
        val phoneNumber = callDetails.handle?.schemeSpecificPart ?: ""
        Log.d(TAG, "Screening call from: $phoneNumber")

        val autoBlockEnabled = prefs.getBoolean(CallBlockerModule.PREF_AUTO_BLOCK_ENABLED, true)
        val blockUnknown = prefs.getBoolean(CallBlockerModule.PREF_BLOCK_UNKNOWN, false)

        val isBlocked = isNumberBlocked(phoneNumber)
        val isInContacts = isNumberInContacts(phoneNumber)

        val response = CallResponse.Builder()
        
        when {
            autoBlockEnabled && isBlocked -> {
                Log.d(TAG, "Blocking spam: $phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                addToBlockedHistory(phoneNumber, "Spam")
                showNotification("Appel bloqué", "Spam: $phoneNumber")
            }
            blockUnknown && !isInContacts -> {
                Log.d(TAG, "Blocking unknown: $phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                addToBlockedHistory(phoneNumber, "Inconnu")
                showNotification("Appel bloqué", "Inconnu: $phoneNumber")
            }
            else -> {
                response.setDisallowCall(false)
                response.setRejectCall(false)
            }
        }
        
        respondToCall(callDetails, response.build())
    }

    private fun isNumberBlocked(phoneNumber: String): Boolean {
        try {
            val json = prefs.getString(CallBlockerModule.PREF_BLOCKED_NUMBERS, "[]") ?: "[]"
            val blockedNumbers = JSONArray(json)
            val normalized = phoneNumber.replace(Regex("[^0-9]"), "").takeLast(9)
            
            for (i in 0 until blockedNumbers.length()) {
                val blocked = blockedNumbers.getString(i).replace(Regex("[^0-9]"), "").takeLast(9)
                if (normalized == blocked) return true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking blocked", e)
        }
        return false
    }

    private fun isNumberInContacts(phoneNumber: String): Boolean {
        try {
            val uri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon()
                .appendPath(phoneNumber).build()
            contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use {
                return it.count > 0
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking contacts", e)
        }
        return false
    }

    private fun addToBlockedHistory(phoneNumber: String, reason: String) {
        try {
            val json = prefs.getString(CallBlockerModule.PREF_BLOCKED_CALL_HISTORY, "[]") ?: "[]"
            val history = JSONArray(json)
            val entry = JSONObject().apply {
                put("phone_number", phoneNumber)
                put("blocked_at", System.currentTimeMillis())
                put("reason", reason)
            }
            val newHistory = JSONArray()
            newHistory.put(entry)
            for (i in 0 until minOf(history.length(), 99)) {
                newHistory.put(history.get(i))
            }
            prefs.edit { putString(CallBlockerModule.PREF_BLOCKED_CALL_HISTORY, newHistory.toString()) }
        } catch (e: Exception) {
            Log.e(TAG, "Error adding history", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Blocage d'appels", NotificationManager.IMPORTANCE_HIGH)
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }

    private fun showNotification(title: String, message: String) {
        try {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(System.currentTimeMillis().toInt(), notification)
        } catch (e: Exception) {
            Log.e(TAG, "Error showing notification", e)
        }
    }
}
