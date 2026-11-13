fn main() {
    linux_gdk_without_wayland();
    linux_gtk4_without_wayland();
    tauri_build::build()
}

/// Some systems build GTK 3 without its Wayland backend (X11 only). The
/// window library (tao) still links two GDK Wayland functions, and only
/// calls them when the window really runs on Wayland, which such a GTK
/// can't do. So when they're missing, the app provides stand-ins
/// (src/gdk_stubs.rs) and links fine. VFM_GDK_WAYLAND=0/1 forces the
/// decision.
fn linux_gdk_without_wayland() {
    println!("cargo::rustc-check-cfg=cfg(vfm_gdk_no_wayland)");
    println!("cargo:rerun-if-env-changed=VFM_GDK_WAYLAND");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("linux") {
        return;
    }
    let has_wayland = match std::env::var("VFM_GDK_WAYLAND").as_deref() {
        Ok("0") => false,
        Ok("1") => true,
        _ => gdk_has_wayland(),
    };
    if !has_wayland {
        println!("cargo:rustc-cfg=vfm_gdk_no_wayland");
        println!("cargo:warning=GTK 3 here has no Wayland support: building for X11 only (stand-ins for its two Wayland functions).");
    }
}

/// The same for GTK 4 in the Chromium build: its window library (winit-gtk4)
/// links GTK 4's Wayland functions. Where GTK 4 has no Wayland backend, the
/// app provides stand-ins (src/gdk4_stubs.rs); scripts/build-linux.sh also
/// tells gdk4-wayland-sys not to look for the missing `gtk4-wayland.pc`
/// (SYSTEM_DEPS_GTK4_WAYLAND_NO_PKG_CONFIG=1). VFM_GTK4_WAYLAND=0/1 forces it.
fn linux_gtk4_without_wayland() {
    println!("cargo::rustc-check-cfg=cfg(vfm_gtk4_no_wayland)");
    println!("cargo:rerun-if-env-changed=VFM_GTK4_WAYLAND");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("linux") || std::env::var_os("CARGO_FEATURE_CHROMIUM").is_none() {
        return;
    }
    let has_wayland = match std::env::var("VFM_GTK4_WAYLAND").as_deref() {
        Ok("0") => false,
        Ok("1") => true,
        _ => lib_has_symbol("gtk4", &["libgtk-4.so", "libgtk-4.so.1"], b"gdk_wayland_display_get_type"),
    };
    if !has_wayland {
        println!("cargo:rustc-cfg=vfm_gtk4_no_wayland");
        println!("cargo:warning=GTK 4 here has no Wayland support: building for X11 only (stand-ins for its Wayland functions).");
    }
}

/// Look for the symbol in the libgdk-3 the build will link against.
/// Unknown means yes (the normal case), so nothing changes elsewhere.
fn gdk_has_wayland() -> bool {
    lib_has_symbol("gdk-3.0", &["libgdk-3.so", "libgdk-3.so.0"], b"gdk_wayland_window_get_wl_surface")
}

/// Whether the library (found through pkg-config's libdir for `package`)
/// contains `symbol`. Unknown means yes.
fn lib_has_symbol(package: &str, files: &[&str], symbol: &[u8]) -> bool {
    let libdir = std::process::Command::new("pkg-config")
        .args(["--variable=libdir", package])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    let Some(libdir) = libdir.filter(|d| !d.is_empty()) else { return true };
    for name in files {
        let path = std::path::Path::new(&libdir).join(name);
        if let Ok(bytes) = std::fs::read(&path) {
            println!("cargo:rerun-if-changed={}", path.display());
            return bytes.windows(symbol.len()).any(|w| w == symbol);
        }
    }
    true
}
