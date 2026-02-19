package fr.solutioninformatique.stoppubbysi

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.database.Cursor
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class CallBlockerService : CallScreeningService() {

    private val TAG = "CallBlockerService"
    private val CHANNEL_ID = "call_blocker_channel"
    private val NOTIFICATION_ID = 1001
    
    private lateinit var prefs: SharedPreferences
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "CallBlockerService created")
        prefs = getSharedPreferences("call_blocker_prefs", Context.MODE_PRIVATE)
        createNotificationChannel()
        initTTS()
    }

    private fun initTTS() {
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale.FRENCH)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.e(TAG, "French language not supported for TTS")
                    // Fallback to default
                    tts?.setLanguage(Locale.getDefault())
                }
                ttsReady = true
                Log.d(TAG, "TTS initialized successfully")
            } else {
                Log.e(TAG, "TTS initialization failed")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        tts?.stop()
        tts?.shutdown()
        tts = null
    }

    override fun onScreenCall(callDetails: Call.Details) {
        val phoneNumber = callDetails.handle?.schemeSpecificPart ?: ""
        Log.d(TAG, "Screening call from: $phoneNumber")

        val autoBlockEnabled = prefs.getBoolean(CallBlockerModule.PREF_AUTO_BLOCK_ENABLED, true)
        val blockUnknown = prefs.getBoolean(CallBlockerModule.PREF_BLOCK_UNKNOWN, false)
        val aiScreeningEnabled = prefs.getBoolean(CallBlockerModule.PREF_AI_SCREENING_ENABLED, false)

        // Check if number is in blocked list
        val isBlocked = isNumberBlocked(phoneNumber)
        
        // Check if number is in contacts
        val isInContacts = isNumberInContacts(phoneNumber)
        
        // Decide what to do with the call
        val response = CallResponse.Builder()
        
        when {
            // Block known spam numbers
            autoBlockEnabled && isBlocked -> {
                Log.d(TAG, "Blocking known spam number: $phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                response.setSkipCallLog(false)
                response.setSkipNotification(false)
                
                addToBlockedHistory(phoneNumber, "Numéro spam connu")
                showNotification("Appel bloqué", "Numéro spam: $phoneNumber")
            }
            
            // Block all unknown numbers if enabled
            blockUnknown && !isInContacts -> {
                Log.d(TAG, "Blocking unknown number: $phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                response.setSkipCallLog(false)
                response.setSkipNotification(false)
                
                addToBlockedHistory(phoneNumber, "Numéro inconnu")
                showNotification("Appel bloqué", "Numéro inconnu: $phoneNumber")
            }
            
            // AI screening for unknown numbers
            aiScreeningEnabled && !isInContacts && !isBlocked -> {
                Log.d(TAG, "AI screening for: $phoneNumber")
                // Let the call ring, but schedule AI screening
                response.setDisallowCall(false)
                response.setRejectCall(false)
                
                // Schedule the AI to answer after delay
                val delay = prefs.getInt(CallBlockerModule.PREF_AI_SCREENING_DELAY, 3) * 1000L
                scheduleAIScreening(phoneNumber, delay)
            }
            
            // Allow the call
            else -> {
                Log.d(TAG, "Allowing call from: $phoneNumber")
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
            
            // Normalize phone number for comparison
            val normalizedNumber = normalizePhoneNumber(phoneNumber)
            
            for (i in 0 until blockedNumbers.length()) {
                val blocked = normalizePhoneNumber(blockedNumbers.getString(i))
                if (normalizedNumber.endsWith(blocked) || blocked.endsWith(normalizedNumber)) {
                    return true
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking blocked numbers", e)
        }
        return false
    }

    private fun normalizePhoneNumber(number: String): String {
        return number.replace(Regex("[^0-9+]"), "")
    }

    private fun isNumberInContacts(phoneNumber: String): Boolean {
        try {
            val uri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon()
                .appendPath(phoneNumber)
                .build()
            
            val cursor: Cursor? = contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup._ID),
                null,
                null,
                null
            )
            
            cursor?.use {
                return it.count > 0
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking contacts", e)
        }
        return false
    }

    private fun scheduleAIScreening(phoneNumber: String, delayMs: Long) {
        // Add to pending screenings
        addToPendingScreenings(phoneNumber, "scheduled")
        
        handler.postDelayed({
            performAIScreening(phoneNumber)
        }, delayMs)
    }

    private fun performAIScreening(phoneNumber: String) {
        Log.d(TAG, "Performing AI screening for: $phoneNumber")
        
        if (!ttsReady || tts == null) {
            Log.e(TAG, "TTS not ready for AI screening")
            updatePendingScreening(phoneNumber, "tts_error")
            return
        }
        
        try {
            // Try to answer the call using TelecomManager
            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            
            if (telecomManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    telecomManager.acceptRingingCall()
                    Log.d(TAG, "Call answered for AI screening")
                    
                    // Wait a moment then speak
                    handler.postDelayed({
                        speakAIMessage(phoneNumber)
                    }, 500)
                    
                } catch (e: SecurityException) {
                    Log.e(TAG, "Permission denied to answer call", e)
                    updatePendingScreening(phoneNumber, "permission_error")
                }
            } else {
                Log.e(TAG, "TelecomManager not available or API too low")
                updatePendingScreening(phoneNumber, "api_error")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error performing AI screening", e)
            updatePendingScreening(phoneNumber, "error")
        }
    }

    private fun speakAIMessage(phoneNumber: String) {
        val message = "Bonjour, vous avez joint un système de filtrage automatique. " +
                "Veuillez vous identifier en indiquant votre nom et l'objet de votre appel. " +
                "Merci."
        
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                Log.d(TAG, "TTS started")
                updatePendingScreening(phoneNumber, "speaking")
            }

            override fun onDone(utteranceId: String?) {
                Log.d(TAG, "TTS completed")
                updatePendingScreening(phoneNumber, "completed")
                showNotification(
                    "Appel filtré par IA",
                    "Le numéro $phoneNumber a reçu le message de filtrage"
                )
            }

            override fun onError(utteranceId: String?) {
                Log.e(TAG, "TTS error")
                updatePendingScreening(phoneNumber, "tts_error")
            }
        })
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            tts?.speak(message, TextToSpeech.QUEUE_FLUSH, null, "ai_screening")
        } else {
            @Suppress("DEPRECATION")
            tts?.speak(message, TextToSpeech.QUEUE_FLUSH, null)
        }
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
            
            // Add to beginning of array
            val newHistory = JSONArray()
            newHistory.put(entry)
            for (i in 0 until minOf(history.length(), 99)) {
                newHistory.put(history.get(i))
            }
            
            prefs.edit { putString(CallBlockerModule.PREF_BLOCKED_CALL_HISTORY, newHistory.toString()) }
        } catch (e: Exception) {
            Log.e(TAG, "Error adding to blocked history", e)
        }
    }

    private fun addToPendingScreenings(phoneNumber: String, status: String) {
        try {
            val json = prefs.getString(CallBlockerModule.PREF_PENDING_SCREENINGS, "[]") ?: "[]"
            val screenings = JSONArray(json)
            
            val entry = JSONObject().apply {
                put("phone_number", phoneNumber)
                put("timestamp", System.currentTimeMillis())
                put("status", status)
            }
            
            screenings.put(entry)
            prefs.edit { putString(CallBlockerModule.PREF_PENDING_SCREENINGS, screenings.toString()) }
        } catch (e: Exception) {
            Log.e(TAG, "Error adding pending screening", e)
        }
    }

    private fun updatePendingScreening(phoneNumber: String, status: String) {
        try {
            val json = prefs.getString(CallBlockerModule.PREF_PENDING_SCREENINGS, "[]") ?: "[]"
            val screenings = JSONArray(json)
            
            for (i in 0 until screenings.length()) {
                val obj = screenings.getJSONObject(i)
                if (obj.getString("phone_number") == phoneNumber) {
                    obj.put("status", status)
                    break
                }
            }
            
            prefs.edit { putString(CallBlockerModule.PREF_PENDING_SCREENINGS, screenings.toString()) }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating pending screening", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Blocage d'appels"
            val descriptionText = "Notifications pour les appels bloqués"
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showNotification(title: String, message: String) {
        try {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(System.currentTimeMillis().toInt(), notification)
        } catch (e: Exception) {
            Log.e(TAG, "Error showing notification", e)
        }
    }
}
