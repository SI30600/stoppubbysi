const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Native Kotlin files content
const CALL_BLOCKER_PACKAGE = `package fr.solutioninformatique.stoppubbysi

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CallBlockerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(CallBlockerModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

const CALL_BLOCKER_MODULE = `package fr.solutioninformatique.stoppubbysi

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import androidx.core.content.edit
import com.facebook.react.bridge.*
import org.json.JSONArray
import org.json.JSONObject

class CallBlockerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private val prefs: SharedPreferences = reactContext.getSharedPreferences(
        "call_blocker_prefs",
        Context.MODE_PRIVATE
    )

    private var roleRequestPromise: Promise? = null

    companion object {
        private const val TAG = "CallBlockerModule"
        private const val REQUEST_CODE_CALL_SCREENING = 1001
        private const val REQUEST_CODE_DIALER = 1002
        
        const val PREF_BLOCKED_NUMBERS = "blocked_numbers"
        const val PREF_AUTO_BLOCK_ENABLED = "auto_block_enabled"
        const val PREF_BLOCK_UNKNOWN = "block_unknown_numbers"
        const val PREF_AI_SCREENING_ENABLED = "ai_screening_enabled"
        const val PREF_AI_SCREENING_DELAY = "ai_screening_delay"
        const val PREF_BLOCKED_CALL_HISTORY = "blocked_call_history"
        const val PREF_PENDING_SCREENINGS = "pending_screenings"
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "CallBlockerModule"

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_CODE_CALL_SCREENING || requestCode == REQUEST_CODE_DIALER) {
            if (resultCode == Activity.RESULT_OK) {
                roleRequestPromise?.resolve(true)
            } else {
                roleRequestPromise?.resolve(false)
            }
            roleRequestPromise = null
        }
    }

    override fun onNewIntent(intent: Intent?) {}

    @ReactMethod
    fun isCallScreeningServiceEnabled(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                val isHeld = roleManager?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) ?: false
                Log.d(TAG, "Call screening role held: \$isHeld")
                promise.resolve(isHeld)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking call screening role", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestCallScreeningRole(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
                    if (roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
                        Log.d(TAG, "Role already held")
                        promise.resolve(true)
                        return
                    }
                    
                    roleRequestPromise = promise
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
                    currentActivity?.startActivityForResult(intent, REQUEST_CODE_CALL_SCREENING)
                } else {
                    Log.w(TAG, "Call screening role not available")
                    promise.resolve(false)
                }
            } else {
                Log.w(TAG, "Android version too low for call screening")
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting call screening role", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestDialerRole(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                    if (roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
                        Log.d(TAG, "Dialer role already held")
                        promise.resolve(true)
                        return
                    }
                    
                    roleRequestPromise = promise
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER)
                    currentActivity?.startActivityForResult(intent, REQUEST_CODE_DIALER)
                } else {
                    Log.w(TAG, "Dialer role not available")
                    promise.resolve(false)
                }
            } else {
                Log.w(TAG, "Android version too low for dialer role")
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting dialer role", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun isDialerRoleHeld(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                val isHeld = roleManager?.isRoleHeld(RoleManager.ROLE_DIALER) ?: false
                Log.d(TAG, "Dialer role held: \$isHeld")
                promise.resolve(isHeld)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking dialer role", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateBlockedNumbers(numbers: ReadableArray, promise: Promise) {
        try {
            val numberList = mutableListOf<String>()
            for (i in 0 until numbers.size()) {
                numbers.getString(i)?.let { numberList.add(it) }
            }
            
            val json = JSONArray(numberList).toString()
            prefs.edit { putString(PREF_BLOCKED_NUMBERS, json) }
            
            Log.d(TAG, "Updated \${numberList.size} blocked numbers")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error updating blocked numbers", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setAutoBlockEnabled(enabled: Boolean, promise: Promise) {
        try {
            prefs.edit { putBoolean(PREF_AUTO_BLOCK_ENABLED, enabled) }
            Log.d(TAG, "Auto block enabled: \$enabled")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting auto block", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBlockUnknownNumbers(enabled: Boolean, promise: Promise) {
        try {
            prefs.edit { putBoolean(PREF_BLOCK_UNKNOWN, enabled) }
            Log.d(TAG, "Block unknown numbers: \$enabled")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting block unknown", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setAIScreeningEnabled(enabled: Boolean, promise: Promise) {
        try {
            prefs.edit { putBoolean(PREF_AI_SCREENING_ENABLED, enabled) }
            Log.d(TAG, "AI screening enabled: \$enabled")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting AI screening", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun isAIScreeningEnabled(promise: Promise) {
        try {
            val enabled = prefs.getBoolean(PREF_AI_SCREENING_ENABLED, false)
            promise.resolve(enabled)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking AI screening", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setAIScreeningDelay(delaySeconds: Int, promise: Promise) {
        try {
            prefs.edit { putInt(PREF_AI_SCREENING_DELAY, delaySeconds) }
            Log.d(TAG, "AI screening delay: \$delaySeconds seconds")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting AI delay", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getAIScreeningDelay(promise: Promise) {
        try {
            val delay = prefs.getInt(PREF_AI_SCREENING_DELAY, 3)
            promise.resolve(delay)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting AI delay", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getPendingScreenings(promise: Promise) {
        try {
            val json = prefs.getString(PREF_PENDING_SCREENINGS, "[]") ?: "[]"
            val array = Arguments.createArray()
            val jsonArray = JSONArray(json)
            
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                val map = Arguments.createMap()
                map.putString("phone_number", obj.getString("phone_number"))
                map.putDouble("timestamp", obj.getLong("timestamp").toDouble())
                map.putString("status", obj.getString("status"))
                array.pushMap(map)
            }
            
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting pending screenings", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearPendingScreenings(promise: Promise) {
        try {
            prefs.edit { putString(PREF_PENDING_SCREENINGS, "[]") }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing pending screenings", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getBlockedCallHistory(promise: Promise) {
        try {
            val json = prefs.getString(PREF_BLOCKED_CALL_HISTORY, "[]") ?: "[]"
            val array = Arguments.createArray()
            val jsonArray = JSONArray(json)
            
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                val map = Arguments.createMap()
                map.putString("phone_number", obj.getString("phone_number"))
                map.putDouble("blocked_at", obj.getLong("blocked_at").toDouble())
                if (obj.has("reason")) {
                    map.putString("reason", obj.getString("reason"))
                }
                array.pushMap(map)
            }
            
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting blocked history", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearBlockedCallHistory(promise: Promise) {
        try {
            prefs.edit { putString(PREF_BLOCKED_CALL_HISTORY, "[]") }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing history", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getSettings(promise: Promise) {
        try {
            val map = Arguments.createMap()
            map.putBoolean("auto_block_spam", prefs.getBoolean(PREF_AUTO_BLOCK_ENABLED, true))
            map.putBoolean("block_unknown_numbers", prefs.getBoolean(PREF_BLOCK_UNKNOWN, false))
            map.putBoolean("ai_screening_enabled", prefs.getBoolean(PREF_AI_SCREENING_ENABLED, false))
            map.putInt("ai_screening_delay", prefs.getInt(PREF_AI_SCREENING_DELAY, 3))
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting settings", e)
            promise.reject("ERROR", e.message)
        }
    }
}
`;

const CALL_BLOCKER_SERVICE = `package fr.solutioninformatique.stoppubbysi

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
        Log.d(TAG, "Screening call from: \$phoneNumber")

        val autoBlockEnabled = prefs.getBoolean(CallBlockerModule.PREF_AUTO_BLOCK_ENABLED, true)
        val blockUnknown = prefs.getBoolean(CallBlockerModule.PREF_BLOCK_UNKNOWN, false)

        val isBlocked = isNumberBlocked(phoneNumber)
        val isInContacts = isNumberInContacts(phoneNumber)

        val response = CallResponse.Builder()
        
        when {
            autoBlockEnabled && isBlocked -> {
                Log.d(TAG, "Blocking spam: \$phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                addToBlockedHistory(phoneNumber, "Spam")
                showNotification("Appel bloqué", "Spam: \$phoneNumber")
            }
            blockUnknown && !isInContacts -> {
                Log.d(TAG, "Blocking unknown: \$phoneNumber")
                response.setDisallowCall(true)
                response.setRejectCall(true)
                addToBlockedHistory(phoneNumber, "Inconnu")
                showNotification("Appel bloqué", "Inconnu: \$phoneNumber")
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
`;

const INCALL_SERVICE = `package fr.solutioninformatique.stoppubbysi

import android.content.Intent
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import android.util.Log

class StopPubInCallService : InCallService() {

    companion object {
        private const val TAG = "StopPubInCallService"
        var instance: StopPubInCallService? = null
        var currentCall: Call? = null
        
        val callCallback = object : Call.Callback() {
            override fun onStateChanged(call: Call, state: Int) {
                Log.d(TAG, "Call state: \$state")
                instance?.sendBroadcast(Intent("fr.solutioninformatique.stoppubbysi.CALL_STATE_CHANGED").apply {
                    putExtra("state", state)
                    setPackage(instance?.packageName)
                })
            }
        }
        
        fun stateToString(state: Int) = when (state) {
            Call.STATE_RINGING -> "RINGING"
            Call.STATE_ACTIVE -> "ACTIVE"
            Call.STATE_DISCONNECTED -> "DISCONNECTED"
            else -> "OTHER"
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        currentCall = call
        call.registerCallback(callCallback)
        
        startActivity(Intent(this, InCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra("phoneNumber", call.details?.handle?.schemeSpecificPart ?: "")
            putExtra("isIncoming", call.state == Call.STATE_RINGING)
        })
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        call.unregisterCallback(callCallback)
        currentCall = null
        sendBroadcast(Intent("fr.solutioninformatique.stoppubbysi.CALL_ENDED").setPackage(packageName))
    }

    fun answerCall() { currentCall?.answer(android.telecom.VideoProfile.STATE_AUDIO_ONLY) }
    fun rejectCall() { currentCall?.reject(false, null) }
    fun hangupCall() { currentCall?.disconnect() }
}
`;

const INCALL_ACTIVITY = `package fr.solutioninformatique.stoppubbysi

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
`;

const ACTIVITY_INCALL_XML = `<?xml version="1.0" encoding="utf-8"?>
<RelativeLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#1a1a2e"
    android:padding="24dp">

    <LinearLayout
        android:id="@+id/topSection"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_alignParentTop="true"
        android:layout_marginTop="48dp"
        android:gravity="center_horizontal"
        android:orientation="vertical">

        <ImageView
            android:layout_width="120dp"
            android:layout_height="120dp"
            android:src="@android:drawable/ic_menu_call"
            android:background="#E91E63"
            android:padding="24dp"
            android:layout_marginBottom="24dp" />

        <TextView
            android:id="@+id/contactNameText"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="Contact"
            android:textColor="#FFFFFF"
            android:textSize="28sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/phoneNumberText"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="8dp"
            android:text="+33 6 00 00 00 00"
            android:textColor="#888888"
            android:textSize="18sp" />

        <TextView
            android:id="@+id/callStatusText"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="16dp"
            android:text="Appel entrant..."
            android:textColor="#4CAF50"
            android:textSize="16sp" />

        <TextView
            android:id="@+id/callDurationText"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="8dp"
            android:text="00:00"
            android:textColor="#FFFFFF"
            android:textSize="24sp"
            android:visibility="gone" />

        <TextView
            android:id="@+id/aiStatusText"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="24dp"
            android:background="#2a2a4e"
            android:paddingHorizontal="16dp"
            android:paddingVertical="8dp"
            android:text="🤖 Filtrage IA"
            android:textColor="#9C27B0"
            android:textSize="14sp"
            android:visibility="gone" />
    </LinearLayout>

    <LinearLayout
        android:id="@+id/middleControls"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_centerInParent="true"
        android:gravity="center"
        android:orientation="horizontal">

        <ImageButton
            android:id="@+id/speakerButton"
            android:layout_width="64dp"
            android:layout_height="64dp"
            android:layout_margin="16dp"
            android:background="#2a2a4e"
            android:src="@android:drawable/ic_lock_silent_mode_off"
            android:padding="16dp"
            android:alpha="0.5" />

        <ImageButton
            android:id="@+id/muteButton"
            android:layout_width="64dp"
            android:layout_height="64dp"
            android:layout_margin="16dp"
            android:background="#2a2a4e"
            android:src="@android:drawable/ic_btn_speak_now"
            android:padding="16dp"
            android:alpha="0.5" />
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_alignParentBottom="true"
        android:layout_marginBottom="48dp"
        android:gravity="center"
        android:orientation="horizontal">

        <Button
            android:id="@+id/rejectButton"
            android:layout_width="80dp"
            android:layout_height="80dp"
            android:layout_margin="16dp"
            android:background="@android:drawable/ic_delete"
            android:backgroundTint="#F44336" />

        <Button
            android:id="@+id/answerButton"
            android:layout_width="80dp"
            android:layout_height="80dp"
            android:layout_margin="16dp"
            android:background="@android:drawable/ic_menu_call"
            android:backgroundTint="#4CAF50" />

        <Button
            android:id="@+id/hangupButton"
            android:layout_width="80dp"
            android:layout_height="80dp"
            android:layout_margin="16dp"
            android:background="@android:drawable/ic_menu_close_clear_cancel"
            android:backgroundTint="#F44336"
            android:visibility="gone" />
    </LinearLayout>
</RelativeLayout>
`;

function withCallBlockerFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidDir = path.join(projectRoot, 'android');
      const javaDir = path.join(androidDir, 'app/src/main/java/fr/solutioninformatique/stoppubbysi');
      const resDir = path.join(androidDir, 'app/src/main/res/layout');

      // Create directories
      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(resDir, { recursive: true });

      // Write Kotlin files
      fs.writeFileSync(path.join(javaDir, 'CallBlockerPackage.kt'), CALL_BLOCKER_PACKAGE);
      fs.writeFileSync(path.join(javaDir, 'CallBlockerModule.kt'), CALL_BLOCKER_MODULE);
      fs.writeFileSync(path.join(javaDir, 'CallBlockerService.kt'), CALL_BLOCKER_SERVICE);
      fs.writeFileSync(path.join(javaDir, 'StopPubInCallService.kt'), INCALL_SERVICE);
      fs.writeFileSync(path.join(javaDir, 'InCallActivity.kt'), INCALL_ACTIVITY);

      // Write layout
      fs.writeFileSync(path.join(resDir, 'activity_incall.xml'), ACTIVITY_INCALL_XML);

      // Modify MainApplication.kt to add the package
      const mainAppPath = path.join(javaDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppPath)) {
        let mainApp = fs.readFileSync(mainAppPath, 'utf8');
        if (!mainApp.includes('CallBlockerPackage')) {
          mainApp = mainApp.replace(
            /override fun getPackages\(\): List<ReactPackage> =\s*PackageList\(this\)\.packages\.apply \{/,
            `override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(CallBlockerPackage())`
          );
          fs.writeFileSync(mainAppPath, mainApp);
        }
      }

      console.log('✅ CallBlocker native files created successfully');
      return config;
    },
  ]);
}

function withCallBlockerManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    // Add services
    if (!app.service) app.service = [];
    
    // CallBlockerService
    if (!app.service.find(s => s.$['android:name'] === '.CallBlockerService')) {
      app.service.push({
        $: {
          'android:name': '.CallBlockerService',
          'android:permission': 'android.permission.BIND_SCREENING_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.telecom.CallScreeningService' } }],
        }],
      });
    }

    // InCallService
    if (!app.service.find(s => s.$['android:name'] === '.StopPubInCallService')) {
      app.service.push({
        $: {
          'android:name': '.StopPubInCallService',
          'android:permission': 'android.permission.BIND_INCALL_SERVICE',
          'android:exported': 'true',
        },
        'meta-data': [
          { $: { 'android:name': 'android.telecom.IN_CALL_SERVICE_UI', 'android:value': 'true' } },
          { $: { 'android:name': 'android.telecom.IN_CALL_SERVICE_RINGING', 'android:value': 'true' } },
        ],
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.telecom.InCallService' } }],
        }],
      });
    }

    // Add InCallActivity
    if (!app.activity) app.activity = [];
    if (!app.activity.find(a => a.$['android:name'] === '.InCallActivity')) {
      app.activity.push({
        $: {
          'android:name': '.InCallActivity',
          'android:exported': 'true',
          'android:launchMode': 'singleTop',
          'android:showOnLockScreen': 'true',
          'android:turnScreenOn': 'true',
          'android:theme': '@style/AppTheme',
          'android:screenOrientation': 'portrait',
        },
      });
    }

    // Add dialer intent filters to MainActivity
    const mainActivity = app.activity.find(a => a.$['android:name'] === '.MainActivity');
    if (mainActivity) {
      if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
      
      const hasDialer = mainActivity['intent-filter'].some(f => 
        f.action && f.action.some(a => a.$['android:name'] === 'android.intent.action.DIAL')
      );
      
      if (!hasDialer) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        });
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:scheme': 'tel' } }],
        });
      }
    }

    console.log('✅ CallBlocker manifest entries added');
    return config;
  });
}

module.exports = function withCallBlocker(config) {
  config = withCallBlockerFiles(config);
  config = withCallBlockerManifest(config);
  return config;
};
