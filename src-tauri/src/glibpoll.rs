//! Linux (Chromium build): keep the main loop from spinning.
//!
//! With CEF's external message pump, Chromium also hooks its own event source
//! into GLib's default main context. Between the pump's ticks (at most 33 ms
//! apart) that source keeps telling GLib its work is due, so GLib polls with a
//! zero timeout, finds nothing ready, and goes round again: a full CPU core spent
//! re-checking the X server, D-Bus and the pump, with nothing to do. Known
//! upstream (CEF, external pump on Linux), not fixed there.
//!
//! GLib lets the app replace the function its loop waits with
//! (`g_main_context_set_poll_func`). This one behaves exactly like `poll`, except
//! after a streak of zero-timeout polls that found nothing: then it waits up to
//! [`NAP_MS`] for a file descriptor instead. Anything that does arrive (X events,
//! D-Bus, the pump's own wake-up pipe) still wakes it at once; only the empty
//! spinning slows down, from many thousands of rounds a second to a few hundred.
//! `VRC_FRIEND_MAP_POLL_THROTTLE=0` keeps GLib's own poll.

use std::os::raw::{c_char, c_int, c_uint, c_ulong, c_void};
use std::sync::atomic::{AtomicU32, Ordering};

/// Empty zero-timeout polls in a row before napping. Real bursts of work (a
/// source that is ready, so its poll comes back with events) reset the count.
const STREAK: u32 = 16;
/// How long a nap may wait for a file descriptor.
const NAP_MS: c_int = 2;

/// `struct pollfd`, which is also GLib's `GPollFD` on Linux.
#[repr(C)]
struct PollFd {
    fd: c_int,
    events: i16,
    revents: i16,
}

extern "C" {
    fn poll(fds: *mut PollFd, nfds: c_ulong, timeout: c_int) -> c_int;
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}

static EMPTY: AtomicU32 = AtomicU32::new(0);

/// What to do with one poll request: `None` = poll as asked, `Some(ms)` = wait
/// up to `ms` instead (only ever for a zero timeout). `empty` is the streak so far.
pub fn nap_for(timeout: c_int, empty: u32) -> Option<c_int> {
    (timeout == 0 && empty >= STREAK).then_some(NAP_MS)
}

unsafe extern "C" fn throttled_poll(fds: *mut PollFd, nfds: c_uint, timeout: c_int) -> c_int {
    let n = nfds as c_ulong;
    if timeout != 0 {
        EMPTY.store(0, Ordering::Relaxed);
        return poll(fds, n, timeout);
    }
    if let Some(ms) = nap_for(timeout, EMPTY.load(Ordering::Relaxed)) {
        let r = poll(fds, n, ms);
        if r != 0 {
            EMPTY.store(0, Ordering::Relaxed);
        }
        return r;
    }
    let r = poll(fds, n, 0);
    if r == 0 {
        EMPTY.fetch_add(1, Ordering::Relaxed);
    } else {
        EMPTY.store(0, Ordering::Relaxed);
    }
    r
}

/// Install the poll function on GLib's default main context (call once, on the main thread).
#[cfg_attr(not(feature = "chromium"), allow(dead_code))]
pub fn install() {
    if std::env::var("VRC_FRIEND_MAP_POLL_THROTTLE").is_ok_and(|v| v == "0") {
        return;
    }
    type SetPollFn = unsafe extern "C" fn(*mut c_void, unsafe extern "C" fn(*mut PollFd, c_uint, c_int) -> c_int);
    type DefaultCtx = unsafe extern "C" fn() -> *mut c_void;
    unsafe {
        // GLib is already loaded (GTK); look the two functions up instead of linking it.
        let set = dlsym(std::ptr::null_mut(), c"g_main_context_set_poll_func".as_ptr());
        let def = dlsym(std::ptr::null_mut(), c"g_main_context_default".as_ptr());
        if set.is_null() || def.is_null() {
            eprintln!("glibpoll: GLib not found, main loop throttle not installed");
            return;
        }
        let set: SetPollFn = std::mem::transmute(set);
        let def: DefaultCtx = std::mem::transmute(def);
        let ctx = def();
        if !ctx.is_null() {
            set(ctx, throttled_poll);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn naps_only_after_a_streak_of_empty_zero_polls() {
        assert_eq!(nap_for(0, 0), None);
        assert_eq!(nap_for(0, STREAK - 1), None);
        assert_eq!(nap_for(0, STREAK), Some(NAP_MS));
        // Waiting polls are never touched.
        assert_eq!(nap_for(33, 1000), None);
        assert_eq!(nap_for(-1, 1000), None);
    }

    #[test]
    fn behaves_like_poll() {
        // A pipe with data is ready at once, also when napping.
        let mut p = [0 as c_int; 2];
        extern "C" {
            fn pipe(fds: *mut c_int) -> c_int;
            fn write(fd: c_int, buf: *const c_void, n: usize) -> isize;
        }
        unsafe {
            assert_eq!(pipe(p.as_mut_ptr()), 0);
            let mut fds = [PollFd { fd: p[0], events: 1, revents: 0 }];
            EMPTY.store(0, Ordering::Relaxed);
            assert_eq!(throttled_poll(fds.as_mut_ptr(), 1, 0), 0);
            EMPTY.store(STREAK, Ordering::Relaxed);
            let t = std::time::Instant::now();
            assert_eq!(throttled_poll(fds.as_mut_ptr(), 1, 0), 0);
            assert!(t.elapsed() >= std::time::Duration::from_millis(1), "naps when nothing is ready");
            write(p[1], b"x".as_ptr().cast(), 1);
            assert_eq!(throttled_poll(fds.as_mut_ptr(), 1, 0), 1);
            assert_eq!(EMPTY.load(Ordering::Relaxed), 0, "something ready resets the streak");
        }
    }
}
