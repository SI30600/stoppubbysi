package fr.solutioninformatique.stoppubbysi

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

class CallBlockerService : CallScreeningService() {
    
    companion object {
        private const val TAG = "CallBlockerService"
        private const val PREFS_NAME = "StopPubbySiPrefs"
        private const val BLOCKED_NUMBERS_KEY = "blocked_numbers"
        private const val BLOCK_UNKNOWN_KEY = "block_unknown_numbers"
        private const val AUTO_BLOCK_KEY = "auto_block_spam"
    }
    
    override fun onScreenCall(callDetails: Call.Details) {
        val phoneNumber = callDetails.handle?.schemeSpecificPart ?: ""
        Log.d(TAG, "Incoming call from: $phoneNumber")
        
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val autoBlockEnabled = prefs.getBoolean(AUTO_BLOCK_KEY, true)
        
        if (!autoBlockEnabled) {
            respondToCall(callDetails, CallResponse.Builder().build())
            return
        }
        
        val shouldBlock = shouldBlockNumber(phoneNumber, prefs)
        
        if (shouldBlock) {
            Log.d(TAG, "Blocking call from: $phoneNumber")
            saveBlockedCall(phoneNumber)
            
            val response = CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(false)
                .build()
            respondToCall(callDetails, response)
        } else {
            respondToCall(callDetails, CallResponse.Builder().build())
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
    
    private fun saveBlockedCall(phoneNumber: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val historyJson = prefs.getString("blocked_history", "[]") ?: "[]"
        try {
            val history = JSONArray(historyJson)
            val callInfo = JSONObject()
            callInfo.put("phone_number", phoneNumber)
            callInfo.put("blocked_at", System.currentTimeMillis())
            history.put(callInfo)
            
            while (history.length() > 100) {
                history.remove(0)
            }
            
            prefs.edit().putString("blocked_history", history.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving blocked call: " + e.message)
        }
    }
}
