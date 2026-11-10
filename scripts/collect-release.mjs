#!/usr/bin/env node
// Copies finished build outputs into release/ with consistent names:
//   vrc-friend-map_<version>_<platform>-<arch>[-variant].<ext>
// Linux packages are named by scripts/build-linux.sh (each format's own
// convention). Usage: node scripts/collect-release.mjs <windows|macos|android|ios> [file]
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const out = join(root, "release");
mkdirSync(out, { recursive: true });

function find(dir, test) {
  const hits = [];
  if (!existsSync(dir)) return hits;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (test(name, p)) hits.push(p);
    }
  };
  walk(dir);
  return hits.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function put(src, name) {
  if (!src) throw new Error(`missing build output for ${name}`);
  copyFileSync(src, join(out, name));
  console.log(`${basename(src)} -> release/${name}`);
}

const platform = process.argv[2];
const target = join(root, "src-tauri", "target");
const v = version;

switch (platform) {
  case "windows": {
    const bundle = join(target, "release", "bundle");
    put(find(join(bundle, "nsis"), (n) => n.endsWith("-setup.exe"))[0], `vrc-friend-map_${v}_windows-x64-setup.exe`);
    put(find(join(bundle, "msi"), (n) => n.endsWith(".msi"))[0], `vrc-friend-map_${v}_windows-x64.msi`);
    put(join(target, "release", "vrc-friend-map.exe"), `vrc-friend-map_${v}_windows-x64-portable.exe`);
    break;
  }
  case "macos": {
    const dmg = find(join(target, "universal-apple-darwin", "release", "bundle", "dmg"), (n) => n.endsWith(".dmg"))[0];
    put(dmg, `vrc-friend-map_${v}_macos-universal.dmg`);
    break;
  }
  case "android": {
    // The workflow signs the APK first and passes the signed file.
    put(process.argv[3], `vrc-friend-map_${v}_android.apk`);
    break;
  }
  case "ios": {
    const ipa = find(join(root, "src-tauri", "gen", "apple"), (n) => n.endsWith(".ipa"))[0];
    put(ipa, `vrc-friend-map_${v}_ios-unsigned.ipa`);
    break;
  }
  default:
    console.error("usage: collect-release.mjs <windows|macos|android|ios> [file]");
    process.exit(2);
}
