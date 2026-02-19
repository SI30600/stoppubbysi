package fr.solutioninformatique.stoppubbysi

import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import android.util.Log

class StopPubInCallService : InCallService() {

    companion object {
        private const val TAG = "StopPubInCallService"
        
        var instance: StopPubInCallService? = null
            private set
        
        var currentCall: Call? = null
            private set
        
        val callCallback = object : Call.Callback() {
            override fun onStateChanged(call: Call, state: Int) {
                Log.d(TAG, "Call state changed to: ${stateToString(state)}")
                updateCallState(call, state)
            }
        }
        
        fun stateToString(state: Int): String {
            return when (state) {
                Call.STATE_NEW -> "NEW"
                Call.STATE_RINGING -> "RINGING"
                Call.STATE_DIALING -> "DIALING"
                Call.STATE_ACTIVE -> "ACTIVE"
                Call.STATE_HOLDING -> "HOLDING"
                Call.STATE_DISCONNECTED -> "DISCONNECTED"
                Call.STATE_CONNECTING -> "CONNECTING"
                Call.STATE_DISCONNECTING -> "DISCONNECTING"
                Call.STATE_SELECT_PHONE_ACCOUNT -> "SELECT_PHONE_ACCOUNT"
                else -> "UNKNOWN($state)"
            }
        }
        
        private fun updateCallState(call: Call, state: Int) {
            // Broadcast state change to InCallActivity
            instance?.let { service ->
                val intent = Intent("fr.solutioninformatique.stoppubbysi.CALL_STATE_CHANGED")
                intent.putExtra("state", state)
                intent.setPackage(service.packageName)
                service.sendBroadcast(intent)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "InCallService created")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "InCallService destroyed")
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        Log.d(TAG, "Call added: ${call.details?.handle?.schemeSpecificPart}")
        
        currentCall = call
        call.registerCallback(callCallback)
        
        // Launch InCallActivity
        val intent = Intent(this, InCallActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        intent.putExtra("phoneNumber", call.details?.handle?.schemeSpecificPart ?: "Inconnu")
        intent.putExtra("isIncoming", call.state == Call.STATE_RINGING)
        startActivity(intent)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        Log.d(TAG, "Call removed")
        
        call.unregisterCallback(callCallback)
        currentCall = null
        
        // Notify activity to finish
        val intent = Intent("fr.solutioninformatique.stoppubbysi.CALL_ENDED")
        intent.setPackage(packageName)
        sendBroadcast(intent)
    }

    override fun onCallAudioStateChanged(audioState: CallAudioState?) {
        super.onCallAudioStateChanged(audioState)
        Log.d(TAG, "Audio state changed: route=${audioState?.route}, muted=${audioState?.isMuted}")
    }

    // Public methods to control calls
    fun answerCall() {
        currentCall?.let { call ->
            Log.d(TAG, "Answering call")
            call.answer(android.telecom.VideoProfile.STATE_AUDIO_ONLY)
        }
    }

    fun rejectCall() {
        currentCall?.let { call ->
            Log.d(TAG, "Rejecting call")
            call.reject(false, null)
        }
    }

    fun hangupCall() {
        currentCall?.let { call ->
            Log.d(TAG, "Hanging up call")
            call.disconnect()
        }
    }

    fun holdCall(hold: Boolean) {
        currentCall?.let { call ->
            if (hold) {
                call.hold()
            } else {
                call.unhold()
            }
        }
    }

    fun setMuted(muted: Boolean) {
        setMuted(muted)
    }

    fun setSpeakerphone(on: Boolean) {
        val route = if (on) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_EARPIECE
        setAudioRoute(route)
    }

    fun playDtmf(digit: Char) {
        currentCall?.playDtmfTone(digit)
        currentCall?.stopDtmfTone()
    }
}
