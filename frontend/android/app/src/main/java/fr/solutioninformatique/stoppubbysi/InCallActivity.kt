package fr.solutioninformatique.stoppubbysi

import android.Manifest
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.database.Cursor
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.util.Locale
import java.util.Timer
import java.util.TimerTask

class InCallActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "InCallActivity"
    }

    private lateinit var phoneNumberText: TextView
    private lateinit var callStatusText: TextView
    private lateinit var callDurationText: TextView
    private lateinit var contactNameText: TextView
    
    private lateinit var answerButton: Button
    private lateinit var rejectButton: Button
    private lateinit var hangupButton: Button
    private lateinit var speakerButton: ImageButton
    private lateinit var muteButton: ImageButton
    
    private lateinit var aiStatusText: TextView
    
    private var phoneNumber: String = ""
    private var isIncoming: Boolean = false
    private var callStartTime: Long = 0
    private var durationTimer: Timer? = null
    
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var aiScreeningEnabled = false
    private var aiScreeningPerformed = false
    private var aiAnsweredCall = false
    
    private lateinit var prefs: SharedPreferences
    private lateinit var audioManager: AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private val handler = Handler(Looper.getMainLooper())
    
    private var isSpeakerOn = false
    private var isMuted = false

    private val callStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                "fr.solutioninformatique.stoppubbysi.CALL_STATE_CHANGED" -> {
                    val state = intent.getIntExtra("state", -1)
                    updateUIForState(state)
                }
                "fr.solutioninformatique.stoppubbysi.CALL_ENDED" -> {
                    finishCall()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Show over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        setContentView(R.layout.activity_incall)
        
        prefs = getSharedPreferences("call_blocker_prefs", Context.MODE_PRIVATE)
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        aiScreeningEnabled = prefs.getBoolean(CallBlockerModule.PREF_AI_SCREENING_ENABLED, false)
        
        initViews()
        initTTS()
        
        phoneNumber = intent.getStringExtra("phoneNumber") ?: "Inconnu"
        isIncoming = intent.getBooleanExtra("isIncoming", false)
        
        phoneNumberText.text = phoneNumber
        contactNameText.text = getContactName(phoneNumber) ?: "Numéro inconnu"
        
        setupForCallType()
        registerReceivers()
        
        // Check if AI screening should be performed
        if (isIncoming && aiScreeningEnabled && !isNumberInContacts(phoneNumber) && !isNumberBlocked(phoneNumber)) {
            Log.d(TAG, "AI Screening will be performed for: $phoneNumber")
            aiStatusText.visibility = View.VISIBLE
            aiStatusText.text = "🤖 Filtrage IA en attente..."
            scheduleAIScreening()
        }
    }

    private fun initViews() {
        phoneNumberText = findViewById(R.id.phoneNumberText)
        callStatusText = findViewById(R.id.callStatusText)
        callDurationText = findViewById(R.id.callDurationText)
        contactNameText = findViewById(R.id.contactNameText)
        
        answerButton = findViewById(R.id.answerButton)
        rejectButton = findViewById(R.id.rejectButton)
        hangupButton = findViewById(R.id.hangupButton)
        speakerButton = findViewById(R.id.speakerButton)
        muteButton = findViewById(R.id.muteButton)
        
        aiStatusText = findViewById(R.id.aiStatusText)
        
        answerButton.setOnClickListener { answerCall() }
        rejectButton.setOnClickListener { rejectCall() }
        hangupButton.setOnClickListener { hangupCall() }
        speakerButton.setOnClickListener { toggleSpeaker() }
        muteButton.setOnClickListener { toggleMute() }
    }

    private fun initTTS() {
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale.FRENCH)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts?.setLanguage(Locale.getDefault())
                }
                ttsReady = true
                Log.d(TAG, "TTS ready")
            } else {
                Log.e(TAG, "TTS init failed")
            }
        }
    }

    private fun setupForCallType() {
        if (isIncoming) {
            callStatusText.text = "Appel entrant..."
            answerButton.visibility = View.VISIBLE
            rejectButton.visibility = View.VISIBLE
            hangupButton.visibility = View.GONE
            callDurationText.visibility = View.GONE
        } else {
            callStatusText.text = "Appel en cours..."
            answerButton.visibility = View.GONE
            rejectButton.visibility = View.GONE
            hangupButton.visibility = View.VISIBLE
        }
    }

    private fun registerReceivers() {
        val filter = IntentFilter().apply {
            addAction("fr.solutioninformatique.stoppubbysi.CALL_STATE_CHANGED")
            addAction("fr.solutioninformatique.stoppubbysi.CALL_ENDED")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(callStateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(callStateReceiver, filter)
        }
    }

    private fun updateUIForState(state: Int) {
        Log.d(TAG, "Updating UI for state: ${StopPubInCallService.stateToString(state)}")
        
        when (state) {
            Call.STATE_RINGING -> {
                callStatusText.text = "Appel entrant..."
                answerButton.visibility = View.VISIBLE
                rejectButton.visibility = View.VISIBLE
                hangupButton.visibility = View.GONE
            }
            Call.STATE_DIALING, Call.STATE_CONNECTING -> {
                callStatusText.text = "Connexion..."
                answerButton.visibility = View.GONE
                rejectButton.visibility = View.GONE
                hangupButton.visibility = View.VISIBLE
            }
            Call.STATE_ACTIVE -> {
                callStatusText.text = "En ligne"
                answerButton.visibility = View.GONE
                rejectButton.visibility = View.GONE
                hangupButton.visibility = View.VISIBLE
                callDurationText.visibility = View.VISIBLE
                startDurationTimer()
                
                // If AI answered, speak the message now
                if (aiAnsweredCall && !aiScreeningPerformed) {
                    handler.postDelayed({ performAIScreening() }, 500)
                }
            }
            Call.STATE_DISCONNECTED -> {
                finishCall()
            }
        }
    }

    private fun scheduleAIScreening() {
        val delay = prefs.getInt(CallBlockerModule.PREF_AI_SCREENING_DELAY, 3) * 1000L
        Log.d(TAG, "Scheduling AI screening in ${delay}ms")
        
        handler.postDelayed({
            if (StopPubInCallService.currentCall?.state == Call.STATE_RINGING) {
                Log.d(TAG, "Auto-answering for AI screening")
                aiStatusText.text = "🤖 Réponse automatique..."
                aiAnsweredCall = true
                answerCall()
            }
        }, delay)
    }

    private fun performAIScreening() {
        if (aiScreeningPerformed) return
        aiScreeningPerformed = true
        
        Log.d(TAG, "Performing AI screening")
        aiStatusText.text = "🤖 Message en cours..."
        
        // Enable speakerphone for TTS
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = true
        isSpeakerOn = true
        updateSpeakerButton()
        
        val message = "Bonjour. Vous avez joint un système de filtrage automatique. " +
                "Veuillez vous identifier en indiquant votre nom et l'objet de votre appel. " +
                "Merci de patienter."
        
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                runOnUiThread { aiStatusText.text = "🤖 Parle à l'appelant..." }
            }
            override fun onDone(utteranceId: String?) {
                runOnUiThread { 
                    aiStatusText.text = "🤖 Message envoyé - En attente de réponse"
                    Toast.makeText(this@InCallActivity, "Message IA envoyé à l'appelant", Toast.LENGTH_SHORT).show()
                }
            }
            override fun onError(utteranceId: String?) {
                runOnUiThread { aiStatusText.text = "❌ Erreur TTS" }
            }
        })
        
        val params = Bundle()
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL)
        tts?.speak(message, TextToSpeech.QUEUE_FLUSH, params, "ai_screening")
    }

    private fun answerCall() {
        Log.d(TAG, "Answer button clicked")
        StopPubInCallService.instance?.answerCall()
    }

    private fun rejectCall() {
        Log.d(TAG, "Reject button clicked")
        StopPubInCallService.instance?.rejectCall()
    }

    private fun hangupCall() {
        Log.d(TAG, "Hangup button clicked")
        StopPubInCallService.instance?.hangupCall()
    }

    private fun toggleSpeaker() {
        isSpeakerOn = !isSpeakerOn
        audioManager.isSpeakerphoneOn = isSpeakerOn
        updateSpeakerButton()
    }

    private fun toggleMute() {
        isMuted = !isMuted
        audioManager.isMicrophoneMute = isMuted
        updateMuteButton()
    }

    private fun updateSpeakerButton() {
        speakerButton.alpha = if (isSpeakerOn) 1.0f else 0.5f
    }

    private fun updateMuteButton() {
        muteButton.alpha = if (isMuted) 1.0f else 0.5f
    }

    private fun startDurationTimer() {
        callStartTime = System.currentTimeMillis()
        durationTimer?.cancel()
        durationTimer = Timer()
        durationTimer?.scheduleAtFixedRate(object : TimerTask() {
            override fun run() {
                val duration = (System.currentTimeMillis() - callStartTime) / 1000
                val minutes = duration / 60
                val seconds = duration % 60
                runOnUiThread {
                    callDurationText.text = String.format("%02d:%02d", minutes, seconds)
                }
            }
        }, 0, 1000)
    }

    private fun finishCall() {
        Log.d(TAG, "Finishing call activity")
        durationTimer?.cancel()
        tts?.stop()
        finish()
    }

    private fun getContactName(phoneNumber: String): String? {
        try {
            val uri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon()
                .appendPath(phoneNumber)
                .build()
            val cursor = contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    return it.getString(0)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting contact name", e)
        }
        return null
    }

    private fun isNumberInContacts(phoneNumber: String): Boolean {
        return getContactName(phoneNumber) != null
    }

    private fun isNumberBlocked(phoneNumber: String): Boolean {
        try {
            val json = prefs.getString(CallBlockerModule.PREF_BLOCKED_NUMBERS, "[]") ?: "[]"
            val blockedNumbers = org.json.JSONArray(json)
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

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(callStateReceiver)
        } catch (e: Exception) { }
        durationTimer?.cancel()
        tts?.stop()
        tts?.shutdown()
    }

    override fun onBackPressed() {
        // Don't allow back button to close call screen
        // User must use hangup/reject buttons
    }
}
