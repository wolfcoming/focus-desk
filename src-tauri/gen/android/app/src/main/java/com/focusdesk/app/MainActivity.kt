package com.focusdesk.app

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  // Disable Wry's WebView.goBack() handler. Android back is owned by
  // Tauri AppPlugin + JS onBackButtonPress (see src/android/App.tsx).
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Match Android web shell --surface so status/nav/page share one color.
    val pageSurface = Color.parseColor("#f4f8fb")
    WindowCompat.setDecorFitsSystemWindows(window, true)
    @Suppress("DEPRECATION")
    window.statusBarColor = pageSurface
    @Suppress("DEPRECATION")
    window.navigationBarColor = pageSurface

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = true
    controller.isAppearanceLightNavigationBars = true

    findViewById<View>(android.R.id.content).setBackgroundColor(pageSurface)
  }
}
