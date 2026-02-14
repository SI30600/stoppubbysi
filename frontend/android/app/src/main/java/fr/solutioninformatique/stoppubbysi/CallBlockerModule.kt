package fr.solutioninformatique.stoppubbysi

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.*
import org.json.JSONArray

class CallBlockerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "CallBlockerModule"
        private const val PREFS_NAME = "StopPubbySiPrefs"
        private const val BLOCKED_NUMBERS_KEY = "blocked_numbers"
        private const val BLOCK_UNKNOWN_KEY = "block_unknown_numbers"
        private const val AUTO_BLOCK_KEY = "auto_block_spam"
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
                // For older Android versions, we can't use CallScreeningService
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
                currentActivity?.startActivityForResult(intent, REQUEST_CODE_SET_DEFAULT_DIALER)
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
            
            Log.d(TAG, "Updated ${numbers.size()} blocked numbers")
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
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
