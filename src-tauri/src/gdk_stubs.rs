//! Stand-ins for the two GDK Wayland functions the window library links,
//! used only when the system's GTK 3 was built without Wayland (see
//! build.rs). They're only ever called on a Wayland display, which such a
//! GTK can't open, so they just return nothing.

use std::ffi::c_void;
use std::ptr::null_mut;

#[no_mangle]
pub extern "C" fn gdk_wayland_window_get_wl_surface(_window: *mut c_void) -> *mut c_void {
    null_mut()
}

#[no_mangle]
pub extern "C" fn gdk_wayland_display_get_wl_display(_display: *mut c_void) -> *mut c_void {
    null_mut()
}
