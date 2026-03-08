package fr.solutioninformatique.stoppubbysi

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
                Log.d(TAG, "Call state: $state")
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
