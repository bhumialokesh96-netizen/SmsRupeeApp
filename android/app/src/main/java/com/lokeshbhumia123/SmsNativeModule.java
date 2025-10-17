package com.lokeshbhumia123; // ⬅️ CRITICAL: CONFIRM THIS PACKAGE NAME

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.os.Build;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import com.learnium.RNDeviceInfo.RNDeviceInfo; 

import java.util.List;

public class SmsNativeModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private static final String SMS_SENT_ACTION = "SMS_SENT_ACTION";

    SmsNativeModule(ReactApplicationContext context) { super(context); this.reactContext = context; }
    @Override public String getName() { return "SmsNativeModule"; }

    @ReactMethod public void getDeviceId(Callback successCallback) {
        String uniqueId = RNDeviceInfo.getUniqueId(reactContext); successCallback.invoke(uniqueId);
    }

    @ReactMethod
    public void sendSms(String recipient, String message, int simId, Callback failureCallback, Callback successCallback) {
        Context context = getReactApplicationContext();
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            failureCallback.invoke("Permission Denied: SEND_SMS required.");
            return;
        }

        int subId = -1;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            SubscriptionManager subscriptionManager = SubscriptionManager.from(context);
            if (subscriptionManager != null && ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                 List<SubscriptionInfo> subs = subscriptionManager.getActiveSubscriptionInfoList();
                 if (subs != null && subs.size() > simId) {
                     subId = subs.get(simId).getSubscriptionId();
                 }
            }
        }
        
        SmsManager smsManager = (subId != -1) ? SmsManager.getSmsManagerForSubscriptionId(subId) : SmsManager.getDefault();

        // Android 12 Fix: Use FLAG_IMMUTABLE
        Intent sentIntent = new Intent(SMS_SENT_ACTION);
        int mutableFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0;

        PendingIntent sentPendingIntent = PendingIntent.getBroadcast(context, 0, sentIntent, mutableFlags);

        context.registerReceiver(new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                // Success/Failure logic is handled here by the native code
                successCallback.invoke("Message processed (SIM " + (simId + 1) + ").");
                context.unregisterReceiver(this);
            }
        }, new IntentFilter(SMS_SENT_ACTION));

        try {
            smsManager.sendTextMessage(recipient, null, message, sentPendingIntent, null);
        } catch (Exception e) {
            failureCallback.invoke("Native Exception: " + e.getMessage());
            try { context.unregisterReceiver(this); } catch (Exception ignored) {} 
        }
    }
}

