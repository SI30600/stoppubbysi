package fr.solutioninformatique.stoppubbysi

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
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
import java.util.Locale
import java.util.Timer
import java.util.TimerTask

class InCallActivity : AppCompatActivity() {
    private val TAG = "InCallActivity"
    
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
    
    private var phoneNumber = ""
    private var isIncoming = false
    private var callStartTime = 0L
    private var durationTimer: Timer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var aiScreeningEnabled = false
    private var aiScreeningPerformed = false
    private var aiAnsweredCall = false
    
    private lateinit var prefs: SharedPreferences
    private lateinit var audioManager: AudioManager
    private val handler = Handler(Looper.getMainLooper())
    private var isSpeakerOn = false
    private var isMuted = false

    private val callStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                "fr.solutioninformatique.stoppubbysi.CALL_STATE_CHANGED" -> updateUIForState(intent.getIntExtra("state", -1))
                "fr.solutioninformatique.stoppubbysi.CALL_ENDED" -> finishCall()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        setContentView(R.layout.activity_incall)
        
        prefs = getSharedPreferences("call_blocker_prefs", Context.MODE_PRIVATE)
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        aiScreeningEnabled = prefs.getBoolean(CallBlockerModule.PREF_AI_SCREENING_ENABLED, false)
        
        initViews()
        initTTS()
        
        phoneNumber = intent.getStringExtra("phoneNumber") ?: ""
        isIncoming = intent.getBooleanExtra("isIncoming", false)
        
        phoneNumberText.text = phoneNumber
        contactNameText.text = getContactName(phoneNumber) ?: "Numéro inconnu"
        setupForCallType()
        registerReceivers()
        
        if (isIncoming && aiScreeningEnabled && !isNumberInContacts(phoneNumber)) {
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
                tts?.setLanguage(Locale.FRENCH)
                ttsReady = true
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
        when (state) {
            Call.STATE_RINGING -> {
                callStatusText.text = "Appel entrant..."
                answerButton.visibility = View.VISIBLE
                rejectButton.visibility = View.VISIBLE
                hangupButton.visibility = View.GONE
            }
            Call.STATE_ACTIVE -> {
                callStatusText.text = "En ligne"
                answerButton.visibility = View.GONE
                rejectButton.visibility = View.GONE
                hangupButton.visibility = View.VISIBLE
                callDurationText.visibility = View.VISIBLE
                startDurationTimer()
                if (aiAnsweredCall && !aiScreeningPerformed) {
                    handler.postDelayed({ performAIScreening() }, 500)
                }
            }
            Call.STATE_DISCONNECTED -> finishCall()
        }
    }

    private fun scheduleAIScreening() {
        val delay = prefs.getInt(CallBlockerModule.PREF_AI_SCREENING_DELAY, 3) * 1000L
        handler.postDelayed({
            if (StopPubInCallService.currentCall?.state == Call.STATE_RINGING) {
                aiStatusText.text = "🤖 Réponse automatique..."
                aiAnsweredCall = true
                answerCall()
            }
        }, delay)
    }

    private fun performAIScreening() {
        if (aiScreeningPerformed) return
        aiScreeningPerformed = true
        aiStatusText.text = "🤖 Message en cours..."
        
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = true
        isSpeakerOn = true
        speakerButton.alpha = 1.0f
        
        val message = "Bonjour. Vous avez joint un système de filtrage automatique. Veuillez vous identifier."
        
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { runOnUiThread { aiStatusText.text = "🤖 Parle..." } }
            override fun onDone(utteranceId: String?) { runOnUiThread { aiStatusText.text = "🤖 Message envoyé" } }
            override fun onError(utteranceId: String?) { runOnUiThread { aiStatusText.text = "❌ Erreur" } }
        })
        
        val params = Bundle().apply { putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL) }
        tts?.speak(message, TextToSpeech.QUEUE_FLUSH, params, "ai")
    }

    private fun answerCall() { StopPubInCallService.instance?.answerCall() }
    private fun rejectCall() { StopPubInCallService.instance?.rejectCall() }
    private fun hangupCall() { StopPubInCallService.instance?.hangupCall() }
    
    private fun toggleSpeaker() {
        isSpeakerOn = !isSpeakerOn
        audioManager.isSpeakerphoneOn = isSpeakerOn
        speakerButton.alpha = if (isSpeakerOn) 1.0f else 0.5f
    }
    
    private fun toggleMute() {
        isMuted = !isMuted
        audioManager.isMicrophoneMute = isMuted
        muteButton.alpha = if (isMuted) 1.0f else 0.5f
    }

    private fun startDurationTimer() {
        callStartTime = System.currentTimeMillis()
        durationTimer?.cancel()
        durationTimer = Timer()
        durationTimer?.scheduleAtFixedRate(object : TimerTask() {
            override fun run() {
                val duration = (System.currentTimeMillis() - callStartTime) / 1000
                runOnUiThread { callDurationText.text = String.format("%02d:%02d", duration / 60, duration % 60) }
            }
        }, 0, 1000)
    }

    private fun finishCall() {
        durationTimer?.cancel()
        tts?.stop()
        finish()
    }

    private fun getContactName(phoneNumber: String): String? {
        try {
            val uri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon().appendPath(phoneNumber).build()
            contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) return it.getString(0)
            }
        } catch (e: Exception) {}
        return null
    }

    private fun isNumberInContacts(phoneNumber: String) = getContactName(phoneNumber) != null

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(callStateReceiver) } catch (e: Exception) {}
        durationTimer?.cancel()
        tts?.shutdown()
    }

    override fun onBackPressed() {}
}
