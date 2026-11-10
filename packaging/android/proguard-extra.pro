# Appended to the generated app/proguard-rules.pro by the release workflow.
#
# The Rust side (wry) calls these classes' methods by name through JNI. wry's
# own keep rules miss some of them (getCookies, clearAllBrowsingData, …), so
# the release build's shrinker (R8) deleted them and the app crashed with
# NoSuchMethodError when logging in. Keep everything in those classes.
-keep class app.vrcfriendmap.RustWebView { *; }
-keep class app.vrcfriendmap.RustWebViewClient { *; }
-keep class app.vrcfriendmap.RustWebChromeClient { *; }
-keep class app.vrcfriendmap.WryActivity { *; }
-keep class app.vrcfriendmap.Ipc { *; }
-keep class app.vrcfriendmap.MainActivity { *; }
