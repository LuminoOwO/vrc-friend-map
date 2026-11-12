#!/usr/bin/env python3
"""Download Chromium (CEF) for the Linux Chromium build, before cargo needs it.

    scripts/fetch-cef.py serve     download if needed, then serve a small index
                                   on localhost until stdin closes; prints its URL

Why: the `cef-dll-sys` build script downloads CEF itself, but first reads the
CDN's index.json, which has grown past the 10 MB its HTTP client accepts
("the response body is larger than request limit"). So this script reads the
index (no size limit), downloads the right archive into the same place the
build script would (CEF_PATH/<version>/, checked by SHA-1), and serves an index
with only the entries needed, for CEF_DOWNLOAD_URL. The build script then finds
the archive already there and only unpacks it.
"""
import hashlib
import http.server
import json
import os
import pathlib
import platform
import re
import sys
import tempfile
import threading
import urllib.request

CDN = os.environ.get("VFM_CEF_CDN", "https://cef-builds.spotifycdn.com")
ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCK = ROOT / "src-tauri" / "chromium" / "Cargo.lock"
PLATFORMS = ["macosarm64", "macosx64", "windows64", "windowsarm64", "windows32", "linux64", "linuxarm64", "linuxarm"]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def cef_version() -> str:
    """151.3.24 from `cef-dll-sys` 151.8.1+151.3.24 in the Chromium lockfile."""
    text = LOCK.read_text()
    m = re.search(r'name = "cef-dll-sys"\nversion = "[^"+]+\+([^"]+)"', text)
    if not m:
        sys.exit("cef-dll-sys not found in " + str(LOCK))
    return m.group(1)


def this_platform() -> tuple[str, str]:
    """(CDN platform name, folder the build script unpacks into)."""
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        return "linux64", "cef_linux_x86_64"
    if machine in ("aarch64", "arm64"):
        return "linuxarm64", "cef_linux_aarch64"
    sys.exit(f"no CEF build for {machine}")


def cef_path() -> pathlib.Path:
    p = os.environ.get("CEF_PATH")
    if p:
        return pathlib.Path(p)
    cache = os.environ.get("XDG_CACHE_HOME") or str(pathlib.Path.home() / ".cache")
    return pathlib.Path(cache) / "tauri-cef"


def sha1(path: pathlib.Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def prepare() -> pathlib.Path:
    version = cef_version()
    plat, folder = this_platform()
    location = cef_path() / version
    out = pathlib.Path(tempfile.mkdtemp(prefix="cef-index-"))
    log(f"Chromium (CEF) {version} for {plat} in {location}")
    if (location / folder / "libcef.so").exists():
        log("Already downloaded and unpacked.")
        (out / "index.json").write_text(json.dumps({p: {"versions": []} for p in PLATFORMS}))
        return out
    log("Reading the CEF index…")
    with urllib.request.urlopen(f"{CDN}/index.json", timeout=120) as r:
        index = json.load(r)
    entry = next((v for v in index[plat]["versions"] if v["cef_version"].startswith(version + "+")), None)
    if not entry:
        sys.exit(f"CEF {version} isn't on the CDN for {plat}")
    minimal = next(f for f in entry["files"] if f["type"] == "minimal")
    archive = location / minimal["name"]
    if archive.exists() and sha1(archive) == minimal["sha1"]:
        log("Archive already downloaded.")
    else:
        location.mkdir(parents=True, exist_ok=True)
        url = f"{CDN}/{minimal['name']}"
        log(f"Downloading {url} …")
        part = archive.with_suffix(archive.suffix + ".part")
        with urllib.request.urlopen(url, timeout=120) as r, open(part, "wb") as dest:
            total = int(r.headers.get("Content-Length") or 0)
            done = 0
            step = 100 << 20
            while chunk := r.read(1 << 20):
                dest.write(chunk)
                done += len(chunk)
                if done // step != (done - len(chunk)) // step:
                    log(f"  {done >> 20} / {total >> 20} MB")
        if sha1(part) != minimal["sha1"]:
            part.unlink()
            sys.exit("Downloaded CEF archive has the wrong SHA-1")
        part.rename(archive)
        log("Downloaded and verified.")
    small = {p: {"versions": []} for p in PLATFORMS}
    small[plat]["versions"] = [entry]
    (out / "index.json").write_text(json.dumps(small))
    return out


def serve(directory: pathlib.Path) -> None:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(directory), **k)

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
    print(f"http://127.0.0.1:{httpd.server_address[1]}", flush=True)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    sys.stdin.read()  # until the build script closes our stdin
    httpd.shutdown()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        serve(prepare())
    else:
        sys.exit(__doc__)
