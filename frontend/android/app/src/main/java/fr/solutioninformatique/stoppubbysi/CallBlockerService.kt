package fr.solutioninformatique.stoppubbysi

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import androidx.annotation.RequiresApi
import org.json.JSONArray

@RequiresApi(Build.VERSION_CODES.N)
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
            // Auto-block is disabled, allow all calls
            respondToCall(callDetails, CallResponse.Builder().build())
            return
        }
        
        val shouldBlock = shouldBlockNumber(phoneNumber, prefs)
        
        if (shouldBlock) {
            Log.d(TAG, "Blocking call from: $phoneNumber")
            
            // Save to blocked history
            saveBlockedCall(phoneNumber)
            
            // Block the call
            val response = CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(false)
                .build()
            respondToCall(callDetails, response)
        } else {
            // Allow the call
            respondToCall(callDetails, CallResponse.Builder().build())
        }
    }
    
    private fun shouldBlockNumber(phoneNumber: String, prefs: SharedPreferences): Boolean {
        // Normalize the phone number
        val normalizedNumber = normalizePhoneNumber(phoneNumber)
        
        // Check if number is in blocked list
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
        
        // Check if blocking unknown numbers is enabled
        val blockUnknown = prefs.getBoolean(BLOCK_UNKNOWN_KEY, false)
        if (blockUnknown && !isKnownNumber(phoneNumber)) {
            return true
        }
        
        return false
    }
    
    private fun normalizePhoneNumber(number: String): String {
        // Remove all non-digit characters except +
        var normalized = number.replace(Regex("[^0-9+]"), "")
        
        // Convert French numbers to international format
        if (normalized.startsWith("0") && normalized.length == 10) {
            normalized = "+33" + normalized.substring(1)
        }
        
        return normalized
    }
    
    private fun isKnownNumber(phoneNumber: String): Boolean {
        // Check if number is in contacts
        // This is a simplified check - in production, query ContactsContract
        return false
    }
    
    private fun saveBlockedCall(phoneNumber: String) {
        // Save blocked call to SharedPreferences for later sync
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val historyJson = prefs.getString("blocked_history", "[]") ?: "[]"
        try {
            val history = JSONArray(historyJson)
            val callInfo = org.json.JSONObject().apply {
                put("phone_number", phoneNumber)
                put("blocked_at", System.currentTimeMillis())
            }
            history.put(callInfo)
            
            // Keep only last 100 calls
            while (history.length() > 100) {
                history.remove(0)
            }
            
            prefs.edit().putString("blocked_history", history.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving blocked call: ${e.message}")
        }
    }
}
