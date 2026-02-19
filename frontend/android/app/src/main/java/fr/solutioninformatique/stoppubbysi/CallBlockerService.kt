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
    private var audioFocusRequest: AudioFocusRequest? = null
    private var currentCallDetails: Call.Details? = null

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
                    Log.e(TAG, "French language not supported for TTS, using default")
                    tts?.setLanguage(Locale.getDefault())
                }
                
                // Configure TTS for phone call audio stream
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    val audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                    tts?.setAudioAttributes(audioAttributes)
                }
                
                ttsReady = true
                Log.d(TAG, "TTS initialized successfully for voice communication")
            } else {
                Log.e(TAG, "TTS initialization failed with status: $status")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseAudioFocus()
        tts?.stop()
        tts?.shutdown()
        tts = null
    }

    override fun onScreenCall(callDetails: Call.Details) {
        val phoneNumber = callDetails.handle?.schemeSpecificPart ?: ""
        Log.d(TAG, "=== SCREENING CALL FROM: $phoneNumber ===")

        val autoBlockEnabled = prefs.getBoolean(CallBlockerModule.PREF_AUTO_BLOCK_ENABLED, true)
        val blockUnknown = prefs.getBoolean(CallBlockerModule.PREF_BLOCK_UNKNOWN, false)
        val aiScreeningEnabled = prefs.getBoolean(CallBlockerModule.PREF_AI_SCREENING_ENABLED, false)

        Log.d(TAG, "Settings - autoBlock: $autoBlockEnabled, blockUnknown: $blockUnknown, aiScreening: $aiScreeningEnabled")

        val isBlocked = isNumberBlocked(phoneNumber)
        val isInContacts = isNumberInContacts(phoneNumber)
        
        Log.d(TAG, "Number status - isBlocked: $isBlocked, isInContacts: $isInContacts")

        val response = CallResponse.Builder()
        
        when {
            // Block known spam numbers
            autoBlockEnabled && isBlocked -> {
                Log.d(TAG, ">>> BLOCKING spam number: $phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                response.setSkipCallLog(false)
                response.setSkipNotification(false)
                
                addToBlockedHistory(phoneNumber, "Numéro spam connu")
                showNotification("🚫 Appel bloqué", "Spam: $phoneNumber")
            }
            
            // Block all unknown numbers if enabled
            blockUnknown && !isInContacts -> {
                Log.d(TAG, ">>> BLOCKING unknown number: $phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                response.setSkipCallLog(false)
                response.setSkipNotification(false)
                
                addToBlockedHistory(phoneNumber, "Numéro inconnu")
                showNotification("🚫 Appel bloqué", "Inconnu: $phoneNumber")
            }
            
            // AI screening for unknown numbers - ANSWER AND SPEAK
            aiScreeningEnabled && !isInContacts && !isBlocked -> {
                Log.d(TAG, ">>> AI SCREENING for: $phoneNumber")
                currentCallDetails = callDetails
                
                // SILENTLY ANSWER the call to play the AI message
                response.setDisallowCall(false)
                response.setRejectCall(false)
                response.setSilenceCall(true)  // Silence the ringtone
                
                // Store for AI processing
                addToPendingScreenings(phoneNumber, "answering")
                
                // Schedule AI response IMMEDIATELY (no delay - answer right away)
                val delay = prefs.getInt(CallBlockerModule.PREF_AI_SCREENING_DELAY, 1) * 1000L
                handler.postDelayed({
                    performAIScreeningWithAudio(phoneNumber, callDetails)
                }, delay)
                
                showNotification("🤖 Filtrage IA en cours", "Analyse de: $phoneNumber")
            }
            
            // Allow the call normally
            else -> {
                Log.d(TAG, ">>> ALLOWING call from: $phoneNumber")
                response.setDisallowCall(false)
                response.setRejectCall(false)
            }
        }
        
        respondToCall(callDetails, response.build())
    }

    private fun performAIScreeningWithAudio(phoneNumber: String, callDetails: Call.Details) {
        Log.d(TAG, "=== PERFORMING AI SCREENING WITH AUDIO ===")
        
        if (!ttsReady || tts == null) {
            Log.e(TAG, "TTS not ready!")
            updatePendingScreening(phoneNumber, "tts_not_ready")
            showNotification("❌ Erreur IA", "TTS non disponible")
            return
        }

        try {
            // Request audio focus for voice communication
            requestAudioFocus()
            
            // Set audio mode to communication
            audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
            audioManager?.isSpeakerphoneOn = true
            
            Log.d(TAG, "Audio configured for voice communication, starting TTS...")
            
            // Speak the AI message
            speakAIMessage(phoneNumber)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in AI screening with audio", e)
            updatePendingScreening(phoneNumber, "error: ${e.message}")
            showNotification("❌ Erreur IA", "Échec: ${e.message}")
        }
    }

    private fun requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(audioAttributes)
                .setAcceptsDelayedFocusGain(false)
                .build()
            
            val result = audioManager?.requestAudioFocus(audioFocusRequest!!)
            Log.d(TAG, "Audio focus request result: $result")
        } else {
            @Suppress("DEPRECATION")
            audioManager?.requestAudioFocus(
                null,
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            )
        }
    }

    private fun releaseAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let {
                audioManager?.abandonAudioFocusRequest(it)
            }
        } else {
            @Suppress("DEPRECATION")
            audioManager?.abandonAudioFocus(null)
        }
        audioManager?.mode = AudioManager.MODE_NORMAL
        audioManager?.isSpeakerphoneOn = false
    }

    private fun speakAIMessage(phoneNumber: String) {
        val message = "Bonjour. Vous avez joint un système de filtrage automatique. " +
                "Veuillez vous identifier en indiquant votre nom et l'objet de votre appel. " +
                "Merci de patienter."
        
        Log.d(TAG, "Speaking AI message: $message")
        
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                Log.d(TAG, ">>> TTS STARTED speaking")
                updatePendingScreening(phoneNumber, "speaking")
            }

            override fun onDone(utteranceId: String?) {
                Log.d(TAG, ">>> TTS COMPLETED")
                updatePendingScreening(phoneNumber, "message_delivered")
                releaseAudioFocus()
                showNotification(
                    "✅ Message IA envoyé",
                    "Le numéro $phoneNumber a reçu le message de filtrage"
                )
            }

            override fun onError(utteranceId: String?) {
                Log.e(TAG, ">>> TTS ERROR")
                updatePendingScreening(phoneNumber, "tts_error")
                releaseAudioFocus()
                showNotification("❌ Erreur TTS", "Échec pour $phoneNumber")
            }
        })
        
        // Speak with high priority
        val params = android.os.Bundle()
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL)
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
        
        val result = tts?.speak(message, TextToSpeech.QUEUE_FLUSH, params, "ai_screening_${System.currentTimeMillis()}")
        Log.d(TAG, "TTS speak result: $result")
    }

    private fun isNumberBlocked(phoneNumber: String): Boolean {
        try {
            val json = prefs.getString(CallBlockerModule.PREF_BLOCKED_NUMBERS, "[]") ?: "[]"
            val blockedNumbers = JSONArray(json)
            val normalizedNumber = normalizePhoneNumber(phoneNumber)
            
            for (i in 0 until blockedNumbers.length()) {
                val blocked = normalizePhoneNumber(blockedNumbers.getString(i))
                if (normalizedNumber.endsWith(blocked) || blocked.endsWith(normalizedNumber) ||
                    normalizedNumber.contains(blocked) || blocked.contains(normalizedNumber)) {
                    Log.d(TAG, "Number $phoneNumber matches blocked number $blocked")
                    return true
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking blocked numbers", e)
        }
        return false
    }

    private fun normalizePhoneNumber(number: String): String {
        return number.replace(Regex("[^0-9]"), "").takeLast(9)
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
                val inContacts = it.count > 0
                Log.d(TAG, "Number $phoneNumber in contacts: $inContacts")
                return inContacts
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
            Log.d(TAG, "Added to blocked history: $phoneNumber - $reason")
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
            Log.d(TAG, "Added pending screening: $phoneNumber - $status")
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
            Log.d(TAG, "Updated pending screening: $phoneNumber -> $status")
        } catch (e: Exception) {
            Log.e(TAG, "Error updating pending screening", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Blocage d'appels StopPubbySi",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications pour les appels bloqués et filtrés"
                enableVibration(true)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showNotification(title: String, message: String) {
        try {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setVibrate(longArrayOf(0, 250, 250, 250))
                .build()

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(System.currentTimeMillis().toInt(), notification)
            Log.d(TAG, "Notification shown: $title - $message")
        } catch (e: Exception) {
            Log.e(TAG, "Error showing notification", e)
        }
    }
}
