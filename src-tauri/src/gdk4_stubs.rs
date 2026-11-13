//! Stand-ins for GTK 4's Wayland functions, for the Chromium build on
//! systems whose GTK 4 was built without Wayland (X11 only); see build.rs.
//! The window library (winit-gtk4) uses them only to ask "is this a Wayland
//! display / surface / monitor?" first, through the `*_get_type` functions:
//! answering with G_TYPE_INVALID (0) makes that always "no", so the rest is
//! never reached. Every function here returns 0 / NULL / FALSE.

macro_rules! stubs {
    ($($name:ident),* $(,)?) => {
        $(
            #[no_mangle]
            pub extern "C" fn $name() -> usize {
                0
            }
        )*
    };
}

stubs!(
    gdk_wayland_device_get_node_path,
    gdk_wayland_device_get_type,
    gdk_wayland_device_get_wl_keyboard,
    gdk_wayland_device_get_wl_pointer,
    gdk_wayland_device_get_wl_seat,
    gdk_wayland_device_get_xkb_keymap,
    gdk_wayland_display_get_egl_display,
    gdk_wayland_display_get_startup_notification_id,
    gdk_wayland_display_get_type,
    gdk_wayland_display_get_wl_compositor,
    gdk_wayland_display_get_wl_display,
    gdk_wayland_display_query_registry,
    gdk_wayland_display_set_cursor_theme,
    gdk_wayland_display_set_startup_notification_id,
    gdk_wayland_gl_context_get_type,
    gdk_wayland_monitor_get_type,
    gdk_wayland_monitor_get_wl_output,
    gdk_wayland_popup_get_type,
    gdk_wayland_seat_get_type,
    gdk_wayland_seat_get_wl_seat,
    gdk_wayland_surface_force_next_commit,
    gdk_wayland_surface_get_type,
    gdk_wayland_surface_get_wl_surface,
    gdk_wayland_toplevel_drop_exported_handle,
    gdk_wayland_toplevel_export_handle,
    gdk_wayland_toplevel_get_type,
    gdk_wayland_toplevel_set_application_id,
    gdk_wayland_toplevel_set_transient_for_exported,
    gdk_wayland_toplevel_unexport_handle,
);
