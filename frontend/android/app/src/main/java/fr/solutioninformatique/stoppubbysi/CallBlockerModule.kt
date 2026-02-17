package fr.solutioninformatique.stoppubbysi

import android.app.role.RoleManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import org.json.JSONArray

class CallBlockerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "CallBlockerModule"
        private const val PREFS_NAME = "StopPubbySiPrefs"
        private const val BLOCKED_NUMBERS_KEY = "blocked_numbers"
        private const val BLOCK_UNKNOWN_KEY = "block_unknown_numbers"
        private const val AUTO_BLOCK_KEY = "auto_block_spam"
        private const val AI_SCREENING_KEY = "ai_screening_enabled"
        private const val AI_SCREENING_DELAY_KEY = "ai_screening_delay"
        private const val REQUEST_CODE_SET_DEFAULT_DIALER = 1001
    }
    
    override fun getName(): String = "CallBlockerModule"
    
    private fun getPrefs(): SharedPreferences {
        return reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    @ReactMethod
    fun isCallScreeningServiceEnabled(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as RoleManager
                val isHeld = roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
                promise.resolve(isHeld)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun requestCallScreeningRole(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as RoleManager
                val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
                reactApplicationContext.currentActivity?.startActivityForResult(intent, REQUEST_CODE_SET_DEFAULT_DIALER)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun updateBlockedNumbers(numbers: ReadableArray, promise: Promise) {
        try {
            val jsonArray = JSONArray()
            for (i in 0 until numbers.size()) {
                jsonArray.put(numbers.getString(i))
            }
            
            getPrefs().edit()
                .putString(BLOCKED_NUMBERS_KEY, jsonArray.toString())
                .apply()
            
            Log.d(TAG, "Updated " + numbers.size() + " blocked numbers")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun setAutoBlockEnabled(enabled: Boolean, promise: Promise) {
        try {
            getPrefs().edit()
                .putBoolean(AUTO_BLOCK_KEY, enabled)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun setBlockUnknownNumbers(enabled: Boolean, promise: Promise) {
        try {
            getPrefs().edit()
                .putBoolean(BLOCK_UNKNOWN_KEY, enabled)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    // AI Screening methods
    @ReactMethod
    fun setAIScreeningEnabled(enabled: Boolean, promise: Promise) {
        try {
            getPrefs().edit()
                .putBoolean(AI_SCREENING_KEY, enabled)
                .apply()
            Log.d(TAG, "AI Screening enabled: $enabled")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun isAIScreeningEnabled(promise: Promise) {
        try {
            val enabled = getPrefs().getBoolean(AI_SCREENING_KEY, false)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun setAIScreeningDelay(delaySeconds: Int, promise: Promise) {
        try {
            getPrefs().edit()
                .putInt(AI_SCREENING_DELAY_KEY, delaySeconds)
                .apply()
            Log.d(TAG, "AI Screening delay set to: $delaySeconds seconds")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun getAIScreeningDelay(promise: Promise) {
        try {
            val delay = getPrefs().getInt(AI_SCREENING_DELAY_KEY, 3)
            promise.resolve(delay)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun getPendingScreenings(promise: Promise) {
        try {
            val pendingJson = getPrefs().getString("pending_screenings", "[]") ?: "[]"
            val pending = JSONArray(pendingJson)
            
            val result = Arguments.createArray()
            for (i in 0 until pending.length()) {
                val item = pending.getJSONObject(i)
                val map = Arguments.createMap()
                map.putString("phone_number", item.getString("phone_number"))
                map.putDouble("timestamp", item.getLong("timestamp").toDouble())
                map.putString("status", item.optString("status", "pending"))
                result.pushMap(map)
            }
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun clearPendingScreenings(promise: Promise) {
        try {
            getPrefs().edit()
                .putString("pending_screenings", "[]")
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun getBlockedCallHistory(promise: Promise) {
        try {
            val historyJson = getPrefs().getString("blocked_history", "[]") ?: "[]"
            val history = JSONArray(historyJson)
            
            val result = Arguments.createArray()
            for (i in 0 until history.length()) {
                val item = history.getJSONObject(i)
                val map = Arguments.createMap()
                map.putString("phone_number", item.getString("phone_number"))
                map.putDouble("blocked_at", item.getLong("blocked_at").toDouble())
                map.putString("reason", item.optString("reason", "blocked"))
                result.pushMap(map)
            }
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun clearBlockedCallHistory(promise: Promise) {
        try {
            getPrefs().edit()
                .putString("blocked_history", "[]")
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun getSettings(promise: Promise) {
        try {
            val prefs = getPrefs()
            val result = Arguments.createMap()
            result.putBoolean("auto_block_spam", prefs.getBoolean(AUTO_BLOCK_KEY, true))
            result.putBoolean("block_unknown_numbers", prefs.getBoolean(BLOCK_UNKNOWN_KEY, false))
            result.putBoolean("ai_screening_enabled", prefs.getBoolean(AI_SCREENING_KEY, false))
            result.putInt("ai_screening_delay", prefs.getInt(AI_SCREENING_DELAY_KEY, 3))
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
