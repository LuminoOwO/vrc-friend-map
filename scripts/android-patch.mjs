// Patches the Android project that `tauri android init` generates
// (src-tauri/gen/android is created in CI, not kept in the repo):
// permissions and anything else the app needs on Android.
// Usage: node scripts/android-patch.mjs   (after `npx tauri android init`)
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MANIFEST = "src-tauri/gen/android/app/src/main/AndroidManifest.xml";
if (!existsSync(MANIFEST)) {
  console.error(`${MANIFEST} not found: run \`npx tauri android init\` first.`);
  process.exit(1);
}

const PERMISSIONS = [
  // haptics (Settings → Interface)
  "android.permission.VIBRATE",
];

let xml = readFileSync(MANIFEST, "utf8");
const added = [];
for (const p of PERMISSIONS) {
  if (xml.includes(`"${p}"`)) continue;
  xml = xml.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="${p}" />`);
  added.push(p);
}
writeFileSync(MANIFEST, xml);
console.log(added.length ? `Added permissions: ${added.join(", ")}` : "Permissions already there.");
