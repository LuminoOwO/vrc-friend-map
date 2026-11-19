#!/usr/bin/env python3
"""Switch the desktop app's Linux build between Chromium and WebKitGTK.

    scripts/chromium.py apply     use Chromium (CEF) for this build
    scripts/chromium.py revert    back to the files as committed
    scripts/chromium.py status

On Linux the app runs on Chromium (CEF) by default, because WebKitGTK draws
the map on the CPU on many systems (NVIDIA on X11 reports no hardware
acceleration at all). Tauri's Chromium runtime isn't released yet, so this
build takes Tauri from its `feat/cef` branch, pinned to one commit below.

`apply` keeps copies of Cargo.toml and Cargo.lock and edits them in place:
  - [patch.crates-io] points every Tauri crate at that commit, and the
    plugins at the matching branch of tauri-apps/plugins-workspace
  - adds the `tauri-runtime-cef` dependency behind the `chromium` feature
Tauri comes from a local checkout of that commit in .tools/tauri-src, with the
fixes in src-tauri/chromium/patches/*.patch applied (fetched and patched by
`apply`; every Tauri crate points at it, so there is only one copy of each).
`revert` puts the copies back. scripts/build-linux.sh does both for you.
Windows, macOS, Android and iOS never use this.
"""
import pathlib
import shutil
import subprocess
import sys

GIT = "https://github.com/tauri-apps/tauri"
REV = "9d1a5b176e337c8395362a4e7c99bac99b36a1d1"  # feat/cef, 2026-10-07
PLUGINS_GIT = "https://github.com/tauri-apps/plugins-workspace"
PLUGINS_REV = "835adce473e8f059f6ba84660dd07bcb19fb9030"  # feat/cef
PLUGINS = ["tauri-plugin-opener", "tauri-plugin-notification"]
CRATES = ["tauri", "tauri-build", "tauri-runtime", "tauri-utils", "tauri-macros", "tauri-codegen", "tauri-plugin"]

ROOT = pathlib.Path(__file__).resolve().parent.parent / "src-tauri"
TOML = ROOT / "Cargo.toml"
LOCK = ROOT / "Cargo.lock"
# Cargo.lock for the Chromium build, so it builds the same every time.
# Refresh it with: scripts/chromium.py apply && (cd src-tauri && cargo update ...)
#   && cp src-tauri/Cargo.lock src-tauri/chromium/Cargo.lock && scripts/chromium.py revert
CHROMIUM_LOCK = ROOT / "chromium" / "Cargo.lock"
MARK = "# --- chromium build (scripts/chromium.py) ---"
TAURI_SRC = ROOT.parent / ".tools" / "tauri-src"
PATCHES = ROOT / "chromium" / "patches"


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(TAURI_SRC), *args], check=check, capture_output=True, text=True)


def tauri_source() -> pathlib.Path:
    """.tools/tauri-src: Tauri at REV with src-tauri/chromium/patches/*.patch applied."""
    patches = sorted(PATCHES.glob("*.patch"))
    if not (TAURI_SRC / ".git").exists():
        TAURI_SRC.mkdir(parents=True, exist_ok=True)
        git("init", "-q")
        git("remote", "add", "origin", GIT)
    if git("rev-parse", "HEAD", check=False).stdout.strip() != REV:
        print(f"Fetching Tauri {REV[:9]} into {TAURI_SRC} ...")
        git("fetch", "-q", "--depth", "1", "origin", REV)
        git("checkout", "-q", "--force", REV)
    # Already patched exactly like this? Then leave the files (and Cargo's cache) alone.
    if patches and all(git("apply", "--check", "-R", str(p), check=False).returncode == 0 for p in patches):
        return TAURI_SRC
    git("reset", "-q", "--hard", REV)
    git("clean", "-q", "-fd")
    for p in patches:
        r = git("apply", str(p), check=False)
        if r.returncode != 0:
            sys.exit(f"Patch {p.name} doesn't apply to Tauri {REV[:9]}:\n{r.stderr}")
        print(f"Applied {p.name}")
    return TAURI_SRC


def backup(p: pathlib.Path) -> pathlib.Path:
    return p.with_name(p.name + ".webkit")


def applied() -> bool:
    return MARK in TOML.read_text()


def apply() -> None:
    if applied():
        print("Chromium build already set up.")
        return
    for p in (TOML, LOCK):
        if p.exists():
            shutil.copy2(p, backup(p))
    text = TOML.read_text()
    feature = 'chromium = []'
    if feature not in text:
        sys.exit("Cargo.toml has no `chromium = []` feature to switch on")
    text = text.replace(feature, 'chromium = ["dep:tauri-runtime-cef"]', 1)
    src = tauri_source()
    rel = lambda crate: (src / "crates" / crate).relative_to(ROOT.parent).as_posix()
    dep = f'tauri-runtime-cef = {{ path = "../{rel("tauri-runtime-cef")}", optional = true }}\n'
    text = text.replace("[dependencies]\n", "[dependencies]\n" + dep, 1)
    patch = [MARK, "[patch.crates-io]"]
    patch += [f'{c} = {{ path = "../{rel(c)}" }}' for c in CRATES]
    # As Tauri's own workspace on that branch: one `dpi` for winit-gtk4 and Tauri.
    patch.append('dpi = { git = "https://github.com/tauri-apps/winit-gtk4", branch = "master" }')
    # Released plugins ask for tauri's `wry` feature, which that branch removed.
    patch += [f'{c} = {{ git = "{PLUGINS_GIT}", rev = "{PLUGINS_REV}" }}' for c in PLUGINS]
    text = text.rstrip("\n") + "\n\n" + "\n".join(patch) + "\n"
    TOML.write_text(text)
    if CHROMIUM_LOCK.exists():
        shutil.copy2(CHROMIUM_LOCK, LOCK)
    print(f"Chromium build set up (Tauri feat/cef @ {REV[:9]}). Build with --features chromium.")


def revert() -> None:
    done = False
    for p in (TOML, LOCK):
        b = backup(p)
        if b.exists():
            shutil.move(b, p)
            done = True
    print("Back to the WebKitGTK build files." if done else "Nothing to revert.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "apply":
        apply()
    elif cmd == "revert":
        revert()
    elif cmd == "status":
        print("chromium" if applied() else "webkit")
    else:
        sys.exit(__doc__)
