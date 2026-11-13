//! The X11 part of the wheel fallback (no Tauri here, so it can be tested on its own).
use std::sync::atomic::{AtomicBool, Ordering};

/// Watches the X server for wheel buttons while the pointer is over `our` window (or its
/// frame) and calls `on(x, y, dx, dy)` with the position in the window (device pixels).
/// Runs until the X connection ends.
pub fn listen(
    our: std::os::raw::c_ulong,
    enabled: &AtomicBool,
    running: &AtomicBool,
    mut on: impl FnMut(i32, i32, i32, i32),
) -> Result<(), String> {
    use std::os::raw::{c_int, c_uint, c_ulong};
    use x11_dl::{xinput2, xlib};

    let xl = xlib::Xlib::open().map_err(|e| e.to_string())?;
    let xi = xinput2::XInput2::open().map_err(|e| e.to_string())?;
    unsafe {
        let display = (xl.XOpenDisplay)(std::ptr::null());
        if display.is_null() {
            return Err("can't open the X display".into());
        }
        let (mut opcode, mut ev, mut err) = (0, 0, 0);
        let name = c"XInputExtension";
        if (xl.XQueryExtension)(display, name.as_ptr(), &mut opcode, &mut ev, &mut err) == 0 {
            return Err("the X server has no XInput extension".into());
        }
        let (mut major, mut minor) = (2, 2);
        if (xi.XIQueryVersion)(display, &mut major, &mut minor) != 0 {
            return Err("XInput 2 not available".into());
        }
        let root = (xl.XDefaultRootWindow)(display);
        let mut bits = [0u8; 4];
        xinput2::XISetMask(&mut bits, xinput2::XI_RawButtonPress);
        let mut mask = xinput2::XIEventMask { deviceid: xinput2::XIAllMasterDevices, mask_len: bits.len() as c_int, mask: bits.as_mut_ptr() };
        (xi.XISelectEvents)(display, root, &mut mask, 1);
        (xl.XFlush)(display);
        running.store(true, Ordering::SeqCst);

        // Is `win` (a child of the root under the pointer) our window or one of its parents (the frame)?
        let ours_under = |win: c_ulong| -> bool {
            if win == 0 {
                return false;
            }
            let mut w = our;
            for _ in 0..16 {
                if w == win {
                    return true;
                }
                let (mut r, mut parent, mut kids, mut n): (c_ulong, c_ulong, *mut c_ulong, c_uint) = (0, 0, std::ptr::null_mut(), 0);
                if (xl.XQueryTree)(display, w, &mut r, &mut parent, &mut kids, &mut n) == 0 {
                    return false;
                }
                if !kids.is_null() {
                    (xl.XFree)(kids.cast());
                }
                if parent == 0 || parent == r {
                    return false;
                }
                w = parent;
            }
            false
        };

        let mut event: xlib::XEvent = std::mem::zeroed();
        loop {
            (xl.XNextEvent)(display, &mut event);
            if !enabled.load(Ordering::SeqCst) {
                continue;
            }
            let mut cookie = event.generic_event_cookie;
            if cookie.type_ != xlib::GenericEvent || cookie.extension != opcode {
                continue;
            }
            if (xl.XGetEventData)(display, &mut cookie) == 0 {
                continue;
            }
            let raw = &*(cookie.data as *const xinput2::XIRawEvent);
            let detail = if cookie.evtype == xinput2::XI_RawButtonPress { raw.detail } else { 0 };
            (xl.XFreeEventData)(display, &mut cookie);
            let (dx, dy) = match detail {
                4 => (0, -1),
                5 => (0, 1),
                6 => (-1, 0),
                7 => (1, 0),
                _ => continue,
            };
            // Where is the pointer, and is our window the one under it?
            let (mut r, mut child) = (0, 0);
            let (mut rx, mut ry, mut wx, mut wy, mut m): (c_int, c_int, c_int, c_int, c_uint) = (0, 0, 0, 0, 0);
            if (xl.XQueryPointer)(display, root, &mut r, &mut child, &mut rx, &mut ry, &mut wx, &mut wy, &mut m) == 0 || !ours_under(child) {
                continue;
            }
            let (mut x, mut y, mut c) = (0, 0, 0);
            (xl.XTranslateCoordinates)(display, root, our, rx, ry, &mut x, &mut y, &mut c);
            on(x, y, dx, dy);
        }
    }
}
