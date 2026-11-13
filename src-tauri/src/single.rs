//! One running copy (Linux / macOS). A second start used to crash the Chromium
//! build: Chromium hands the start over to the running copy ("Opening in
//! existing browser session") and the new process then fails. Now, before
//! anything else starts, a second copy asks the first over a local socket to
//! show its window, and exits quietly.
//!
//! Chromium's helper processes run this same program with `--type=…`; they're
//! left alone.

#[cfg(all(unix, desktop))]
mod imp {
    use std::io::{Read, Write};
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::PathBuf;
    use std::sync::OnceLock;
    use std::time::Duration;

    type Show = Box<dyn Fn() + Send + Sync>;
    static ON_SHOW: OnceLock<Show> = OnceLock::new();

    fn socket_path() -> PathBuf {
        let dir = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from).filter(|d| d.is_dir()).unwrap_or_else(std::env::temp_dir);
        // SAFETY: getuid never fails.
        let uid = unsafe { libc_getuid() };
        dir.join(format!("vrc-friend-map-{uid}.sock"))
    }

    extern "C" {
        #[link_name = "getuid"]
        fn libc_getuid() -> u32;
    }

    /// Returns false when another copy is running (it was asked to show itself).
    pub fn claim() -> bool {
        if std::env::args().any(|a| a.starts_with("--type=")) || std::env::var_os("VRC_FRIEND_MAP_MULTI").is_some() {
            return true;
        }
        let path = socket_path();
        if let Ok(mut s) = UnixStream::connect(&path) {
            let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
            let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
            if s.write_all(b"show\n").is_ok() {
                let mut ok = [0u8; 2];
                if s.read_exact(&mut ok).is_ok() && &ok == b"ok" {
                    eprintln!("VRC Friend Map is already running; showing its window.");
                    return false;
                }
            }
        }
        // Nobody answered: a leftover socket from a crash, or none at all.
        let _ = std::fs::remove_file(&path);
        match UnixListener::bind(&path) {
            Ok(listener) => {
                std::thread::Builder::new()
                    .name("single-instance".into())
                    .spawn(move || {
                        for conn in listener.incoming().flatten() {
                            serve(conn);
                        }
                    })
                    .ok();
            }
            Err(e) => eprintln!("VRC Friend Map: can't watch for a second start ({e})"),
        }
        true
    }

    fn serve(mut conn: UnixStream) {
        let _ = conn.set_read_timeout(Some(Duration::from_secs(2)));
        let mut buf = [0u8; 16];
        let n = conn.read(&mut buf).unwrap_or(0);
        if buf[..n].starts_with(b"show") {
            if let Some(show) = ON_SHOW.get() {
                show();
            }
            let _ = conn.write_all(b"ok");
        }
    }

    pub fn on_show(f: impl Fn() + Send + Sync + 'static) {
        let _ = ON_SHOW.set(Box::new(f));
    }

    pub fn release() {
        let _ = std::fs::remove_file(socket_path());
    }
}

#[cfg(not(all(unix, desktop)))]
mod imp {
    pub fn claim() -> bool {
        true
    }
    pub fn on_show(_f: impl Fn() + Send + Sync + 'static) {}
    pub fn release() {}
}

pub use imp::{claim, on_show, release};
