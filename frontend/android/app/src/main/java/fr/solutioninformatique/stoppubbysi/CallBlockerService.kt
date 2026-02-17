package fr.solutioninformatique.stoppubbysi

import android.content.Context
import android.content.SharedPreferences
import android.media.MediaRecorder
import android.os.Build
import android.os.Environment
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.Timer
import java.util.TimerTask

class CallBlockerService : CallScreeningService() {
    
    companion object {
        private const val TAG = "CallBlockerService"
        private const val PREFS_NAME = "StopPubbySiPrefs"
        private const val BLOCKED_NUMBERS_KEY = "blocked_numbers"
        private const val BLOCK_UNKNOWN_KEY = "block_unknown_numbers"
        private const val AUTO_BLOCK_KEY = "auto_block_spam"
        private const val AI_SCREENING_KEY = "ai_screening_enabled"
        private const val AI_SCREENING_DELAY_KEY = "ai_screening_delay"
        
        // Default AI screening message
        const val AI_GREETING_MESSAGE = "Bonjour, vous n'êtes pas reconnu. Merci de vous identifier et d'indiquer l'objet de votre appel."
    }
    
    private var textToSpeech: TextToSpeech? = null
    private var mediaRecorder: MediaRecorder? = null
    private var isRecording = false
    private var currentRecordingPath: String? = null
    
    override fun onCreate() {
        super.onCreate()
        initTextToSpeech()
    }
    
    private fun initTextToSpeech() {
        textToSpeech = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = textToSpeech?.setLanguage(Locale.FRENCH)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.e(TAG, "French language not supported for TTS")
                } else {
                    Log.d(TAG, "TTS initialized successfully in French")
                }
            } else {
                Log.e(TAG, "TTS initialization failed")
            }
        }
    }
    
    override fun onScreenCall(callDetails: Call.Details) {
        val phoneNumber = callDetails.handle?.schemeSpecificPart ?: ""
        Log.d(TAG, "Incoming call from: $phoneNumber")
        
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val autoBlockEnabled = prefs.getBoolean(AUTO_BLOCK_KEY, true)
        val aiScreeningEnabled = prefs.getBoolean(AI_SCREENING_KEY, false)
        
        if (!autoBlockEnabled) {
            respondToCall(callDetails, CallResponse.Builder().build())
            return
        }
        
        val shouldBlock = shouldBlockNumber(phoneNumber, prefs)
        
        if (shouldBlock) {
            Log.d(TAG, "Blocking call from: $phoneNumber")
            saveBlockedCall(phoneNumber, "spam")
            
            val response = CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(false)
                .build()
            respondToCall(callDetails, response)
        } else if (aiScreeningEnabled && isUnknownNumber(phoneNumber, prefs)) {
            // AI Screening for unknown numbers
            Log.d(TAG, "AI Screening for unknown number: $phoneNumber")
            handleAIScreening(callDetails, phoneNumber, prefs)
        } else {
            respondToCall(callDetails, CallResponse.Builder().build())
        }
    }
    
    private fun handleAIScreening(callDetails: Call.Details, phoneNumber: String, prefs: SharedPreferences) {
        val delaySeconds = prefs.getInt(AI_SCREENING_DELAY_KEY, 3)
        
        // Schedule AI screening after delay
        Timer().schedule(object : TimerTask() {
            override fun run() {
                // Note: In a real implementation, you would need to:
                // 1. Answer the call programmatically
                // 2. Play the TTS message
                // 3. Record the response
                // 4. Send to Whisper for transcription
                // 5. Notify the user
                
                // For now, we save the pending screening info
                savePendingScreening(phoneNumber)
                
                Log.d(TAG, "AI Screening triggered for: $phoneNumber")
            }
        }, (delaySeconds * 1000).toLong())
        
        // Allow the call to ring while we prepare
        respondToCall(callDetails, CallResponse.Builder().build())
    }
    
    private fun isUnknownNumber(phoneNumber: String, prefs: SharedPreferences): Boolean {
        // Check if number is in contacts or known numbers
        // For now, return true for all numbers not in blocked list
        val blockedNumbersJson = prefs.getString(BLOCKED_NUMBERS_KEY, "[]") ?: "[]"
        val normalizedNumber = normalizePhoneNumber(phoneNumber)
        
        try {
            val blockedNumbers = JSONArray(blockedNumbersJson)
            for (i in 0 until blockedNumbers.length()) {
                val blockedNumber = normalizePhoneNumber(blockedNumbers.getString(i))
                if (normalizedNumber == blockedNumber || 
                    normalizedNumber.endsWith(blockedNumber) || 
                    blockedNumber.endsWith(normalizedNumber)) {
                    return false // It's a known blocked number
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking known numbers: " + e.message)
        }
        
        return true // Unknown number
    }
    
    private fun savePendingScreening(phoneNumber: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val pendingJson = prefs.getString("pending_screenings", "[]") ?: "[]"
        
        try {
            val pending = JSONArray(pendingJson)
            val screeningInfo = JSONObject()
            screeningInfo.put("phone_number", phoneNumber)
            screeningInfo.put("timestamp", System.currentTimeMillis())
            screeningInfo.put("status", "pending")
            pending.put(screeningInfo)
            
            prefs.edit().putString("pending_screenings", pending.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving pending screening: " + e.message)
        }
    }
    
    private fun shouldBlockNumber(phoneNumber: String, prefs: SharedPreferences): Boolean {
        val normalizedNumber = normalizePhoneNumber(phoneNumber)
        
        val blockedNumbersJson = prefs.getString(BLOCKED_NUMBERS_KEY, "[]") ?: "[]"
        try {
            val blockedNumbers = JSONArray(blockedNumbersJson)
            for (i in 0 until blockedNumbers.length()) {
                val blockedNumber = normalizePhoneNumber(blockedNumbers.getString(i))
                if (normalizedNumber == blockedNumber || 
                    normalizedNumber.endsWith(blockedNumber) || 
                    blockedNumber.endsWith(normalizedNumber)) {
                    return true
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing blocked numbers: " + e.message)
        }
        
        val blockUnknown = prefs.getBoolean(BLOCK_UNKNOWN_KEY, false)
        if (blockUnknown) {
            return true
        }
        
        return false
    }
    
    private fun normalizePhoneNumber(number: String): String {
        var normalized = number.replace(Regex("[^0-9+]"), "")
        if (normalized.startsWith("0") && normalized.length == 10) {
            normalized = "+33" + normalized.substring(1)
        }
        return normalized
    }
    
    private fun saveBlockedCall(phoneNumber: String, reason: String = "blocked") {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val historyJson = prefs.getString("blocked_history", "[]") ?: "[]"
        try {
            val history = JSONArray(historyJson)
            val callInfo = JSONObject()
            callInfo.put("phone_number", phoneNumber)
            callInfo.put("blocked_at", System.currentTimeMillis())
            callInfo.put("reason", reason)
            history.put(callInfo)
            
            while (history.length() > 100) {
                history.remove(0)
            }
            
            prefs.edit().putString("blocked_history", history.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving blocked call: " + e.message)
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        stopRecording()
    }
    
    private fun stopRecording() {
        if (isRecording) {
            try {
                mediaRecorder?.stop()
                mediaRecorder?.release()
                mediaRecorder = null
                isRecording = false
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping recording: " + e.message)
            }
        }
    }
}
