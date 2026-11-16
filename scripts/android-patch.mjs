// Patches the Android project that `tauri android init` generates
// (src-tauri/gen/android is created in CI, not kept in the repo):
// permissions, the app's own Kotlin code (packaging/android/kotlin), its
// resources (packaging/android/res), and the manifest entries for them.
// Usage: node scripts/android-patch.mjs   (after `npx tauri android init`)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const APP = "src-tauri/gen/android/app/src/main";
const MANIFEST = `${APP}/AndroidManifest.xml`;
if (!existsSync(MANIFEST)) {
  console.error(`${MANIFEST} not found: run \`npx tauri android init\` first.`);
  process.exit(1);
}

// ---- code and resources ----
const KOTLIN_DEST = `${APP}/java/app/vrcfriendmap`;
mkdirSync(KOTLIN_DEST, { recursive: true });
for (const f of readdirSync("packaging/android/kotlin")) copyFileSync(join("packaging/android/kotlin", f), join(KOTLIN_DEST, f));
for (const sub of readdirSync("packaging/android/res")) {
  mkdirSync(`${APP}/res/${sub}`, { recursive: true });
  for (const f of readdirSync(join("packaging/android/res", sub))) copyFileSync(join("packaging/android/res", sub, f), join(`${APP}/res/${sub}`, f));
}

// ---- manifest ----
const PERMISSIONS = [
  // haptics (Settings → Interface)
  "android.permission.VIBRATE",
  // staying connected in the background (Settings → Phone in the background)
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
];

let xml = readFileSync(MANIFEST, "utf8");
const added = [];
for (const p of PERMISSIONS) {
  if (xml.includes(`"${p}"`)) continue;
  xml = xml.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="${p}" />`);
  added.push(p);
}

// Finding UnifiedPush distributors (package visibility, Android 11+).
if (!xml.includes("org.unifiedpush.android.distributor.REGISTER")) {
  xml = xml.replace(
    /(<manifest[^>]*>)/,
    `$1
    <queries>
        <intent>
            <action android:name="org.unifiedpush.android.distributor.REGISTER" />
        </intent>
    </queries>`,
  );
}

const COMPONENTS = `
        <service
            android:name="app.vrcfriendmap.KeepAliveService"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Keeps the live connection to VRChat for friend and invite notifications while the app is in the background, when the user turns it on" />
        </service>
        <receiver android:name="app.vrcfriendmap.PushReceiver" android:exported="true">
            <intent-filter>
                <action android:name="org.unifiedpush.android.connector.MESSAGE" />
                <action android:name="org.unifiedpush.android.connector.UNREGISTERED" />
                <action android:name="org.unifiedpush.android.connector.NEW_ENDPOINT" />
                <action android:name="org.unifiedpush.android.connector.REGISTRATION_FAILED" />
            </intent-filter>
        </receiver>
        <receiver android:name="app.vrcfriendmap.FriendsWidget" android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/vfm_widget_info" />
        </receiver>
`;
if (!xml.includes("app.vrcfriendmap.KeepAliveService")) xml = xml.replace(/(<\/application>)/, `${COMPONENTS}    $1`);

// Text shared to the app (a VRChat link from another app's share menu).
const SHARE = `
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
`;
if (!xml.includes("android.intent.action.SEND")) {
  // The first activity is the app's main one.
  xml = xml.replace(/(<activity[\s\S]*?)(\n\s*<\/activity>)/, `$1${SHARE}$2`);
}

writeFileSync(MANIFEST, xml);
console.log(added.length ? `Added permissions: ${added.join(", ")}` : "Permissions already there.");
console.log("Copied the app's Kotlin code and resources; manifest has the service, push receiver, widget and share target.");
