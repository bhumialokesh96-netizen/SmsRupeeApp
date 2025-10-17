package com.lokeshbhumia123; // ⬅️ CRITICAL: CONFIRM THIS PACKAGE NAME

import android.app.Application;
import android.content.res.Configuration;
import androidx.annotation.NonNull;

import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.config.ReactFeatureFlags;
import com.facebook.soloader.SoLoader;
import com.lokeshbhumia123.newarchitecture.MainApplicationReactNativeHost;

import expo.modules.ApplicationLifecycleDispatcher;
import expo.modules.ReactNativeHostWrapper;

import java.util.List;

// 1. IMPORT YOUR PACKAGE HERE
import com.lokeshbhumia123.SmsNativePackage; 

public class MainApplication extends Application implements ReactApplication {
  private final ReactNativeHost mReactNativeHost = new ReactNativeHostWrapper(
    this,
    new ReactNativeHost(this) {
    @Override
    public boolean getUseDeveloperSupport() {
      return BuildConfig.DEBUG;
    }

    @Override
    protected List<ReactPackage> getPackages() {
      @SuppressWarnings("UnnecessaryLocalVariable")
      List<ReactPackage> packages = new PackageList(this).getPackages();
      
      // 2. ADD YOUR CUSTOM PACKAGE HERE
      packages.add(new SmsNativePackage()); 

      return packages;
    }

    @Override protected String getJSMainModuleName() { return "index"; }
  });

  private final ReactNativeHost mNewArchitectureReactNativeHost = new ReactNativeHostWrapper(this, new MainApplicationReactNativeHost(this));

  @Override
  public ReactNativeHost getReactNativeHost() {
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) { return mNewArchitectureReactNativeHost; } else { return mReactNativeHost; }
  }

  @Override
  public void onCreate() {
    super.onCreate();
    ApplicationLifecycleDispatcher.onApplicationCreate(this);
  }

  @Override
  public void onConfigurationChanged(@NonNull Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig);
  }
}

