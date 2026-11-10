#!/usr/bin/env node
// Prints release notes for a version: a "which file do I need" table plus
// that version's CHANGELOG.md section. Usage: node scripts/release-notes.mjs 0.3.0
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const v = (process.argv[2] || JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).replace(/^v/, "");
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const start = changelog.search(new RegExp(`^## ${v.replace(/\./g, "\\.")}\\b.*$`, "m"));
let section = "";
if (start >= 0) {
  const rest = changelog.slice(start).split("\n").slice(1).join("\n");
  const next = rest.search(/^## /m);
  section = (next >= 0 ? rest.slice(0, next) : rest).trim();
}

console.log(`## Which file do I need?

| You have | Download |
|---|---|
| Windows 10/11 | \`vrc-friend-map_${v}_windows-x64-setup.exe\` (or the \`.msi\`; \`-portable.exe\` runs without installing) |
| Debian / Ubuntu / Linux Mint | \`vrc-friend-map_${v}_amd64.deb\` (ARM: \`_arm64.deb\`) |
| Fedora / openSUSE | \`vrc-friend-map-${v}-1.x86_64.rpm\` |
| Any Linux | \`vrc-friend-map-${v}-x86_64.AppImage\` or \`vrc-friend-map-${v}-linux-x86_64.tar.gz\` |
| Android 7+ | \`vrc-friend-map_${v}_android.apk\` |
| iPhone / iPad | \`vrc-friend-map_${v}_ios-unsigned.ipa\` (sideload with AltStore / SideStore / Sideloadly) |
| Mac | \`vrc-friend-map_${v}_macos-universal.dmg\` |
| vfm-server (optional, for a spare device) | \`vfm-server-${v}-linux-arm64.tar.gz\` (Raspberry Pi 64-bit), \`-linux-armv7\` / \`-linux-armv6\` (32-bit Pi), \`-linux-x86_64\` / \`-linux-x86\`, \`-android-termux-arm64\`, \`-windows-x64.zip\`, \`-macos-universal\`. See server/README.md |

Files are built by GitHub Actions and appear a little while after the release is created. \`SHA256SUMS\` has the checksums. Windows and Mac builds aren't code-signed, so the system asks once before opening them. Updating keeps your circles and settings (older data is backed up to \`store/backups\` first).

${section || "_No changelog entry for this version._"}
`);
