package fr.solutioninformatique.stoppubbysi

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.UUID

class CallBlockerService : CallScreeningService() {
    
    companion object {
        private const val TAG = "CallBlockerService"
        private const val PREFS_NAME = "StopPubbySiPrefs"
        private const val BLOCKED_NUMBERS_KEY = "blocked_numbers"
        private const val BLOCK_UNKNOWN_KEY = "block_unknown_numbers"
        private const val AUTO_BLOCK_KEY = "auto_block_spam"
        private const val AI_SCREENING_KEY = "ai_screening_enabled"
        private const val AI_SCREENING_DELAY_KEY = "ai_screening_delay"
        private const val CHANNEL_ID = "stoppubbysi_screening"
        private const val NOTIFICATION_ID = 1001
        
        const val AI_GREETING_MESSAGE = "Bonjour, vous n'êtes pas reconnu. Merci de vous identifier et d'indiquer l'objet de votre appel."
        const val RECORDING_DURATION_MS = 10000L // 10 seconds
    }
    
    private var textToSpeech: TextToSpeech? = null
    private var mediaRecorder: MediaRecorder? = null
    private var isRecording = false
    private var currentRecordingPath: String? = null
    private var isTTSReady = false
    private val handler = Handler(Looper.getMainLooper())
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        initTextToSpeech()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Filtrage d'appels"
            val descriptionText = "Notifications de filtrage d'appels IA"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                enableVibration(true)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun initTextToSpeech() {
        textToSpeech = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = textToSpeech?.setLanguage(Locale.FRENCH)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.e(TAG, "French language not supported for TTS")
                } else {
                    isTTSReady = true
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
        
        // Check if number is in spam list
        val isSpam = shouldBlockNumber(phoneNumber, prefs)
        
        if (isSpam && autoBlockEnabled) {
            // Block spam calls immediately
            Log.d(TAG, "Blocking spam call from: $phoneNumber")
            saveBlockedCall(phoneNumber, "spam")
            
            val response = CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(false)
                .build()
            respondToCall(callDetails, response)
            return
        }
        
        // Check if AI screening is enabled for unknown numbers
        if (aiScreeningEnabled && !isSpam) {
            Log.d(TAG, "AI Screening enabled for: $phoneNumber")
            val delaySeconds = prefs.getInt(AI_SCREENING_DELAY_KEY, 3)
            
            // Allow the call to ring, then start AI screening after delay
            respondToCall(callDetails, CallResponse.Builder().build())
            
            // Schedule AI screening
            handler.postDelayed({
                startAIScreening(phoneNumber)
            }, (delaySeconds * 1000).toLong())
            return
        }
        
        // Allow the call
        respondToCall(callDetails, CallResponse.Builder().build())
    }
    
    private fun startAIScreening(phoneNumber: String) {
        Log.d(TAG, "Starting AI screening for: $phoneNumber")
        
        try {
            // Answer the call using TelecomManager
            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                telecomManager.acceptRingingCall()
                Log.d(TAG, "Call answered automatically")
                
                // Wait a moment for the call to connect, then play TTS
                handler.postDelayed({
                    playGreetingAndRecord(phoneNumber)
                }, 1000)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied to answer call: ${e.message}")
            // Send notification that screening failed
            sendScreeningNotification(phoneNumber, "Inconnu", "Impossible de filtrer l'appel - permissions manquantes")
        } catch (e: Exception) {
            Log.e(TAG, "Error answering call: ${e.message}")
            sendScreeningNotification(phoneNumber, "Inconnu", "Erreur lors du filtrage")
        }
    }
    
    private fun playGreetingAndRecord(phoneNumber: String) {
        if (!isTTSReady) {
            Log.e(TAG, "TTS not ready")
            sendScreeningNotification(phoneNumber, "Inconnu", "Service vocal non disponible")
            return
        }
        
        // Set up TTS completion listener
        textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                Log.d(TAG, "TTS started")
            }
            
            override fun onDone(utteranceId: String?) {
                Log.d(TAG, "TTS completed, starting recording")
                handler.post {
                    startRecording(phoneNumber)
                }
            }
            
            override fun onError(utteranceId: String?) {
                Log.e(TAG, "TTS error")
                handler.post {
                    sendScreeningNotification(phoneNumber, "Inconnu", "Erreur vocale")
                }
            }
        })
        
        // Play the greeting message
        val utteranceId = UUID.randomUUID().toString()
        
        // Use speakerphone for the message
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_CALL
        audioManager.isSpeakerphoneOn = true
        
        textToSpeech?.speak(AI_GREETING_MESSAGE, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }
    
    private fun startRecording(phoneNumber: String) {
        try {
            val recordingDir = File(filesDir, "recordings")
            if (!recordingDir.exists()) {
                recordingDir.mkdirs()
            }
            
            val fileName = "screening_${System.currentTimeMillis()}.mp4"
            val recordingFile = File(recordingDir, fileName)
            currentRecordingPath = recordingFile.absolutePath
            
            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            
            mediaRecorder?.apply {
                setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(currentRecordingPath)
                prepare()
                start()
            }
            
            isRecording = true
            Log.d(TAG, "Recording started: $currentRecordingPath")
            
            // Stop recording after RECORDING_DURATION_MS
            handler.postDelayed({
                stopRecordingAndProcess(phoneNumber)
            }, RECORDING_DURATION_MS)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting recording: ${e.message}")
            sendScreeningNotification(phoneNumber, "Inconnu", "Impossible d'enregistrer")
            endCall()
        }
    }
    
    private fun stopRecordingAndProcess(phoneNumber: String) {
        try {
            if (isRecording && mediaRecorder != null) {
                mediaRecorder?.stop()
                mediaRecorder?.release()
                mediaRecorder = null
                isRecording = false
                Log.d(TAG, "Recording stopped")
                
                // End the call
                endCall()
                
                // Process the recording (transcription will be done by the app)
                val recordingPath = currentRecordingPath
                if (recordingPath != null) {
                    // Save pending screening info for the app to process
                    savePendingScreening(phoneNumber, recordingPath)
                    
                    // For now, send a notification that screening is complete
                    // The app will process the audio when opened
                    sendScreeningNotification(
                        phoneNumber, 
                        "Appel filtré", 
                        "Ouvrez l'app pour voir la transcription"
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recording: ${e.message}")
            sendScreeningNotification(phoneNumber, "Inconnu", "Erreur lors du traitement")
        }
    }
    
    private fun endCall() {
        try {
            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                telecomManager.endCall()
                Log.d(TAG, "Call ended")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error ending call: ${e.message}")
        }
    }
    
    private fun sendScreeningNotification(phoneNumber: String, callerName: String, purpose: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        // Create intent to call back
        val callIntent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:$phoneNumber")
        }
        val callPendingIntent = PendingIntent.getActivity(
            this, 0, callIntent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create intent to open the app
        val openAppIntent = packageManager.getLaunchIntentForPackage(packageName)
        val openAppPendingIntent = PendingIntent.getActivity(
            this, 1, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle("📞 $callerName")
            .setContentText(purpose)
            .setSubText(phoneNumber)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(openAppPendingIntent)
            .addAction(android.R.drawable.ic_menu_call, "Rappeler", callPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Ignorer", null)
            .build()
        
        notificationManager.notify(NOTIFICATION_ID, notification)
        Log.d(TAG, "Notification sent for: $phoneNumber")
    }
    
    private fun savePendingScreening(phoneNumber: String, recordingPath: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val pendingJson = prefs.getString("pending_screenings", "[]") ?: "[]"
        
        try {
            val pending = JSONArray(pendingJson)
            val screeningInfo = JSONObject()
            screeningInfo.put("phone_number", phoneNumber)
            screeningInfo.put("timestamp", System.currentTimeMillis())
            screeningInfo.put("recording_path", recordingPath)
            screeningInfo.put("status", "pending_transcription")
            pending.put(screeningInfo)
            
            prefs.edit().putString("pending_screenings", pending.toString()).apply()
            Log.d(TAG, "Pending screening saved for: $phoneNumber")
        } catch (e: Exception) {
            Log.e(TAG, "Error saving pending screening: ${e.message}")
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
            Log.e(TAG, "Error parsing blocked numbers: ${e.message}")
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
            Log.e(TAG, "Error saving blocked call: ${e.message}")
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        handler.removeCallbacksAndMessages(null)
        
        if (isRecording) {
            try {
                mediaRecorder?.stop()
                mediaRecorder?.release()
                mediaRecorder = null
                isRecording = false
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping recording on destroy: ${e.message}")
            }
        }
    }
}
