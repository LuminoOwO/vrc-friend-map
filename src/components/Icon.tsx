const PATHS: Record<string, string> = {
  graph: "M6 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M12 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M8 6h8M7 8l4 8M17 8l-4 8",
  cards: "M4 4h7v7h-7zM13 4h7v7h-7zM4 13h7v7h-7zM13 13h7v7h-7z",
  share: "M6 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M18 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M18 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M8.3 10.8l7.4 -3.6M8.3 13.2l7.4 3.6",
  search: "M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M20 20l-5.5 -5.5",
  filter: "M4 5h16l-6 7v6l-4 2v-8z",
  refresh: "M19.5 9a8 8 0 0 0 -14.6 -2M4.5 15a8 8 0 0 0 14.6 2M5 3v4h4M19 21v-4h-4",
  settings: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 3v2.5M12 18.5v2.5M3 12h2.5M18.5 12h2.5M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8 -1.8M16.6 7.4l1.8 -1.8",
  close: "M6 6l12 12M18 6l-12 12",
  pause: "M8 5v14M16 5v14",
  play: "M7 4l13 8l-13 8z",
  plus: "M12 5v14M5 12h14",
  eye: "M2 12s3.6 -7 10 -7s10 7 10 7s-3.6 7 -10 7s-10 -7 -10 -7zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  eyeOff: "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.4 5.4a10.7 10.7 0 0 1 2.6 -.4c6.4 0 10 7 10 7a17 17 0 0 1 -3.2 4.1M6.6 6.6c-2.9 1.9 -4.6 5.4 -4.6 5.4s3.6 7 10 7a9.7 9.7 0 0 0 5.4 -1.6",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1 -13M9 7v-3h6v3",
  menu: "M4 6h16M4 12h16M4 18h16",
  star: "M12 3l2.8 5.7l6.2 .9l-4.5 4.4l1.1 6.2l-5.6 -3l-5.6 3l1.1 -6.2l-4.5 -4.4l6.2 -.9z",
  fit: "M4 9v-5h5M20 9v-5h-5M4 15v5h5M20 15v5h-5",
  tag: "M3 12v-8h8l10 10l-8 8z M7.5 7.5h.01",
  user: "M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M5 21v-1a7 7 0 0 1 14 0v1",
  logout: "M14 8v-3h-9v14h9v-3M10 12h11M18 9l3 3l-3 3",
  copy: "M8 8h12v12h-12zM16 8v-4h-12v12h4",
  download: "M12 4v12M7 11l5 5l5 -5M5 20h14",
  upload: "M12 20v-12M7 13l5 -5l5 5M5 4h14",
  info: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8h.01M11 12h1v4h1",
  desktop: "M3 5h18v11h-18zM8 20h8M12 16v4",
  headset: "M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-4l-2 -2h-2l-2 2h-4a2 2 0 0 1 -2 -2zM7.5 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M16.5 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
  phone: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1zM11 18h2",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 7v5l3 3",
  calendar: "M4 6h16v14h-16zM4 10h16M8 3v4M16 3v4",
  idcard: "M3 6h18v12h-18zM7 10h4M7 14h6M15 10h2M15 14h2",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-12a1 1 0 0 1 1 -1h5",
  rocket: "M5 19l3 -3M14 4c4 0 6 2 6 6l-7 7l-6 -6zM9 11l-4 1l-1 3l4 -1M13 15l-1 4l3 -1l1 -4",
  pin: "M12 21s-7 -6 -7 -11a7 7 0 0 1 14 0c0 5 -7 11 -7 11zM12 10m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
    shield: "M12 3l8 3v6c0 5 -3.5 8 -8 9c-4.5 -1 -8 -4 -8 -9v-6z",
  link: "M10 14a4 4 0 0 0 5.7 0l3 -3a4 4 0 0 0 -5.7 -5.7l-1 1M14 10a4 4 0 0 0 -5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1 -1",
  bookmark: "M7 3h10v18l-5 -4l-5 4z",
  sound: "M4 9h4l5 -4v14l-5 -4h-4zM16 9a3 3 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11",
    sliders: "M4 6h9M17 6h3M15 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 12h3M11 12h9M9 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 18h11M19 18h1M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  lock: "M6 11h12v9h-12zM8 11v-3a4 4 0 0 1 8 0v3M12 15v2",
  unlock: "M6 11h12v9h-12zM8 11v-3a4 4 0 0 1 7.5 -2M12 15v2",
  server: "M4 5h16v6h-16zM4 13h16v6h-16zM8 8h.01M8 16h.01",
  key: "M8 15m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M11 12l9 -9M17 6l3 3M15 8l2 2",
  help: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6 .3 -1 .9 -1 1.6v.6M12 17h.01",
  warn: "M12 4l9 16h-18zM12 10v4M12 17h.01",
  "chevron-up": "M6 15l6 -6l6 6",
  "chevron-down": "M6 9l6 6l6 -6",
  "user-plus": "M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M4 21v-2a4 4 0 0 1 4 -4h4M16 19h6M19 16v6",
  "user-check": "M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M4 21v-2a4 4 0 0 1 4 -4h4M15 19l2 2l4 -4",
  users: "M9 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3 20v-1a5 5 0 0 1 5 -5h2a5 5 0 0 1 5 5v1M16 4.5a3 3 0 0 1 0 6M21 20v-1a5 5 0 0 0 -3.5 -4.8",
};

export function Icon({ name, size = 18, title }: { name: keyof typeof PATHS | string; size?: number; title?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
