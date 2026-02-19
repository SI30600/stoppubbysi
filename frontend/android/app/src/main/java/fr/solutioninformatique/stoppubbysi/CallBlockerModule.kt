package fr.solutioninformatique.stoppubbysi

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
                Log.d(TAG, "Call screening role held: $isHeld")
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
                Log.d(TAG, "Dialer role held: $isHeld")
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
            
            Log.d(TAG, "Updated ${numberList.size} blocked numbers")
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
            Log.d(TAG, "Auto block enabled: $enabled")
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
            Log.d(TAG, "Block unknown numbers: $enabled")
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
            Log.d(TAG, "AI screening enabled: $enabled")
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
            Log.d(TAG, "AI screening delay: $delaySeconds seconds")
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
