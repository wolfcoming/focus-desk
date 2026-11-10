package com.focusdesk.app

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Keep content above system bars. Transparent/overlay nav was covering the tab bar.
    WindowCompat.setDecorFitsSystemWindows(window, true)
    window.statusBarColor = Color.parseColor("#d7e4ec")
    window.navigationBarColor = Color.parseColor("#d7e4ec")

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = true
    controller.isAppearanceLightNavigationBars = true

    findViewById<View>(android.R.id.content).setBackgroundColor(Color.parseColor("#d7e4ec"))
  }
}
