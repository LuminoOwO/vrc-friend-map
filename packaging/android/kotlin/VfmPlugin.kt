// VRC Friend Map: Android-only native parts. Copied into the generated
// project by scripts/android-patch.mjs (package app.vrcfriendmap).
//
// - KeepAliveService: a foreground service so the app keeps its live
//   connection while in the background ("visible" shows a normal ongoing
//   notification, "quiet" a minimised silent one: on Android 13+ it then
//   mostly shows under "Active apps").
// - UnifiedPush (Sunup, ntfy, …): registering with a distributor and showing
//   pushed notifications (encrypted with a key only your devices know).
// - Screen refresh rate (above 60 Hz), the home-screen widget, text shared
//   to the app, and asking to be left out of battery optimisation.
package app.vrcfriendmap

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Base64
import android.webkit.WebView
import android.widget.RemoteViews
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val PREFS = "vfm"
private const val UP_REGISTER = "org.unifiedpush.android.distributor.REGISTER"
private const val UP_UNREGISTER = "org.unifiedpush.android.distributor.UNREGISTER"
private const val UP_ACK = "org.unifiedpush.android.distributor.MESSAGE_ACK"

private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

private fun immutable(): Int = if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0

@InvokeArg
class BackgroundArgs {
    var mode: String = "off"
    var text: String = ""
}

@InvokeArg
class RateArgs {
    var hz: Double = 0.0
}

@InvokeArg
class WidgetArgs {
    var title: String = ""
    var lines: List<String> = emptyList()
}

@InvokeArg
class PushArgs {
    var distributor: String? = null
    var key: String? = null
}

@InvokeArg
class ForegroundArgs {
    var foreground: Boolean = true
}

@TauriPlugin
class VfmPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: WebView) {
        super.load(webView)
        handleIntent(activity.intent)
    }

    override fun onNewIntent(intent: Intent) {
        handleIntent(intent)
    }

    /** Text shared to the app (a VRChat link from another app's share menu). */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
        val p = prefs(activity)
        val list = JSONArray(p.getString("shared", "[]"))
        list.put(text)
        p.edit().putString("shared", list.toString()).apply()
    }

    @Command
    fun setBackground(invoke: Invoke) {
        val args = invoke.parseArgs(BackgroundArgs::class.java)
        val intent = Intent(activity, KeepAliveService::class.java)
        if (args.mode == "off") {
            activity.stopService(intent)
        } else {
            intent.putExtra("mode", args.mode).putExtra("text", args.text)
            if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
        }
        invoke.resolve()
    }

    @Command
    fun batteryExempt(invoke: Invoke) {
        val pm = activity.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        val ret = JSObject()
        if (Build.VERSION.SDK_INT >= 23 && !pm.isIgnoringBatteryOptimizations(activity.packageName)) {
            try {
                activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${activity.packageName}")))
                ret.put("asked", true)
            } catch (e: Exception) {
                ret.put("asked", false)
            }
        } else ret.put("asked", false)
        ret.put("exempt", Build.VERSION.SDK_INT < 23 || pm.isIgnoringBatteryOptimizations(activity.packageName))
        invoke.resolve(ret)
    }

    @Command
    fun refreshRates(invoke: Invoke) {
        @Suppress("DEPRECATION")
        val display = if (Build.VERSION.SDK_INT >= 30) activity.display else activity.windowManager.defaultDisplay
        val rates = JSArray()
        if (display != null && Build.VERSION.SDK_INT >= 23) {
            val cur = display.mode
            display.supportedModes
                .filter { it.physicalWidth == cur.physicalWidth && it.physicalHeight == cur.physicalHeight }
                .map { it.refreshRate.toDouble() }
                .distinct()
                .sorted()
                .forEach { rates.put(it) }
        }
        val ret = JSObject()
        ret.put("rates", rates)
        ret.put("current", display?.refreshRate?.toDouble() ?: 60.0)
        invoke.resolve(ret)
    }

    @Command
    fun setRefreshRate(invoke: Invoke) {
        val args = invoke.parseArgs(RateArgs::class.java)
        activity.runOnUiThread {
            @Suppress("DEPRECATION")
            val display = if (Build.VERSION.SDK_INT >= 30) activity.display else activity.windowManager.defaultDisplay
            if (display != null && Build.VERSION.SDK_INT >= 23) {
                val cur = display.mode
                val same = display.supportedModes.filter { it.physicalWidth == cur.physicalWidth && it.physicalHeight == cur.physicalHeight }
                val want = if (args.hz <= 0) same.maxByOrNull { it.refreshRate } else same.minByOrNull { Math.abs(it.refreshRate - args.hz) }
                if (want != null) {
                    val lp = activity.window.attributes
                    lp.preferredDisplayModeId = want.modeId
                    activity.window.attributes = lp
                }
            }
            invoke.resolve()
        }
    }

    @Command
    fun setWidget(invoke: Invoke) {
        val args = invoke.parseArgs(WidgetArgs::class.java)
        prefs(activity).edit().putString("widgetTitle", args.title).putString("widgetLines", JSONArray(args.lines).toString()).apply()
        FriendsWidget.refresh(activity)
        invoke.resolve()
    }

    @Command
    fun setForeground(invoke: Invoke) {
        val args = invoke.parseArgs(ForegroundArgs::class.java)
        prefs(activity).edit().putBoolean("foreground", args.foreground).apply()
        invoke.resolve()
    }

    @Command
    fun pushDistributors(invoke: Invoke) {
        val list = JSArray()
        val pm = activity.packageManager
        @Suppress("DEPRECATION")
        val found = pm.queryBroadcastReceivers(Intent(UP_REGISTER), 0)
        for (r in found) {
            val pkg = r.activityInfo.packageName
            if (pkg == activity.packageName) continue
            val o = JSObject()
            o.put("id", pkg)
            o.put("name", try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (e: Exception) { pkg })
            list.put(o)
        }
        val ret = JSObject()
        ret.put("distributors", list)
        invoke.resolve(ret)
    }

    @Command
    fun pushRegister(invoke: Invoke) {
        val args = invoke.parseArgs(PushArgs::class.java)
        val dist = args.distributor ?: return invoke.reject("pick a distributor")
        val p = prefs(activity)
        val token = p.getString("upToken", null) ?: java.util.UUID.randomUUID().toString()
        p.edit().putString("upToken", token).putString("upDistributor", dist).putString("upKey", args.key ?: "").apply()
        val intent = Intent(UP_REGISTER).setPackage(dist)
            .putExtra("token", token)
            .putExtra("application", activity.packageName)
            .putExtra("message", "VRC Friend Map")
            .putExtra("pi", PendingIntent.getBroadcast(activity, 0, Intent("app.vrcfriendmap.UP_AUTH").setPackage(activity.packageName), immutable()))
        activity.sendBroadcast(intent)
        invoke.resolve()
    }

    @Command
    fun pushUnregister(invoke: Invoke) {
        val p = prefs(activity)
        val dist = p.getString("upDistributor", null)
        val token = p.getString("upToken", null)
        if (dist != null && token != null) activity.sendBroadcast(Intent(UP_UNREGISTER).setPackage(dist).putExtra("token", token))
        p.edit().remove("upEndpoint").remove("upDistributor").apply()
        invoke.resolve()
    }

    /** Things that happened while the UI wasn't looking: push endpoint, shared text. */
    @Command
    fun poll(invoke: Invoke) {
        val p = prefs(activity)
        val ret = JSObject()
        ret.put("endpoint", p.getString("upEndpoint", "") ?: "")
        ret.put("distributor", p.getString("upDistributor", "") ?: "")
        ret.put("pushError", p.getString("upError", "") ?: "")
        val shared = JSArray()
        val list = JSONArray(p.getString("shared", "[]"))
        for (i in 0 until list.length()) shared.put(list.getString(i))
        ret.put("shared", shared)
        p.edit().putString("shared", "[]").apply()
        invoke.resolve(ret)
    }
}

/** Keeps the app's process (and its live connection) running in the background. */
class KeepAliveService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val quiet = intent?.getStringExtra("mode") == "quiet"
        val text = intent?.getStringExtra("text")?.takeIf { it.isNotBlank() } ?: "Live updates in the background"
        val channel = if (quiet) "vfm_quiet" else "vfm_live"
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(channel, if (quiet) "Background (quiet)" else "Background", if (quiet) NotificationManager.IMPORTANCE_MIN else NotificationManager.IMPORTANCE_LOW)
            ch.setShowBadge(false)
            nm.createNotificationChannel(ch)
        }
        val open = PendingIntent.getActivity(this, 0, packageManager.getLaunchIntentForPackage(packageName), immutable())
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channel) else Notification.Builder(this)
        val n = b.setSmallIcon(applicationInfo.icon).setContentTitle("VRC Friend Map").setContentText(text).setContentIntent(open).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(1, n)
        return START_NOT_STICKY
    }
}

/** UnifiedPush messages from the distributor (Sunup, ntfy, …). */
class PushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val p = prefs(context)
        val token = intent.getStringExtra("token")
        if (token == null || token != p.getString("upToken", null)) return
        when (intent.action) {
            "org.unifiedpush.android.connector.NEW_ENDPOINT" -> {
                p.edit().putString("upEndpoint", intent.getStringExtra("endpoint") ?: "").remove("upError").apply()
            }
            "org.unifiedpush.android.connector.REGISTRATION_FAILED" -> {
                p.edit().remove("upEndpoint").putString("upError", intent.getStringExtra("reason") ?: "registration failed").apply()
            }
            "org.unifiedpush.android.connector.UNREGISTERED" -> {
                p.edit().remove("upEndpoint").apply()
            }
            "org.unifiedpush.android.connector.MESSAGE" -> {
                val bytes = intent.getByteArrayExtra("bytesMessage") ?: intent.getStringExtra("message")?.toByteArray() ?: return
                // Acknowledge (newer distributors expect it).
                val id = intent.getStringExtra("id")
                val dist = p.getString("upDistributor", null)
                if (id != null && dist != null) context.sendBroadcast(Intent(UP_ACK).setPackage(dist).putExtra("token", token).putExtra("id", id))
                // The app itself shows notifications while it's open.
                if (p.getBoolean("foreground", false)) return
                val json = decrypt(p.getString("upKey", "") ?: "", bytes) ?: return
                show(context, json)
            }
        }
    }

    private fun decrypt(keyB64: String, data: ByteArray): JSONObject? {
        return try {
            val raw = String(data).trim()
            val bytes = Base64.decode(raw, Base64.DEFAULT)
            if (keyB64.isEmpty() || bytes.size < 28) return null
            val key = SecretKeySpec(Base64.decode(keyB64, Base64.DEFAULT), "AES")
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes, 0, 12))
            JSONObject(String(c.doFinal(bytes, 12, bytes.size - 12)))
        } catch (e: Exception) {
            null
        }
    }

    private fun show(context: Context, json: JSONObject) {
        val nm = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("vfm_push", "Friends and invites", NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(context, 0, context.packageManager.getLaunchIntentForPackage(context.packageName), immutable())
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, "vfm_push") else Notification.Builder(context)
        val n = b.setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(json.optString("title", "VRC Friend Map"))
            .setContentText(json.optString("body", ""))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(json.optString("tag", "vfm").hashCode(), n)
    }
}

/** Home-screen widget: starred friends online right now (filled in by the app). */
class FriendsWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, views(context))
    }

    companion object {
        fun views(context: Context): RemoteViews {
            val p = prefs(context)
            val res = context.resources
            val layout = res.getIdentifier("vfm_widget", "layout", context.packageName)
            val titleId = res.getIdentifier("vfm_widget_title", "id", context.packageName)
            val bodyId = res.getIdentifier("vfm_widget_body", "id", context.packageName)
            val v = RemoteViews(context.packageName, layout)
            val lines = JSONArray(p.getString("widgetLines", "[]"))
            val text = (0 until lines.length()).joinToString("\n") { lines.getString(it) }
            v.setTextViewText(titleId, p.getString("widgetTitle", "Starred friends online"))
            v.setTextViewText(bodyId, if (text.isEmpty()) "Nobody right now" else text)
            val open = PendingIntent.getActivity(context, 0, context.packageManager.getLaunchIntentForPackage(context.packageName), immutable())
            v.setOnClickPendingIntent(bodyId, open)
            v.setOnClickPendingIntent(titleId, open)
            return v
        }

        fun refresh(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            val ids = m.getAppWidgetIds(ComponentName(context, FriendsWidget::class.java))
            for (id in ids) m.updateAppWidget(id, views(context))
        }
    }
}
