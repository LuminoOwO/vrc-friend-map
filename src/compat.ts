// Which app and server versions work together. The server says the oldest app it works with
// (`min_app` in its info); the app knows the oldest server it works with. When they don't fit,
// the app says what to update and stops syncing with that server until then, instead of
// failing in odd ways.

/** The oldest vfm-server this app works with. Raise it when the app starts to need something new from servers. */
export const MIN_SERVER = "0.12.0";

/** a is newer than b ("0.12.10" > "0.12.9"; a leading "v" and "-beta" parts are ignored). */
export function newerVersion(a: string, b: string): boolean {
  const p = (v: string) => v.replace(/^v/, "").split("-")[0].split(".").map((x) => Number(x) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

export interface Mismatch {
  /** Short, for status chips: "Needs a newer app". */
  short: string;
  /** What to do, in a sentence. */
  text: string;
}

/** Whether this app and a server fit together; null when they do. */
export function versionMismatch(app: string, server: { version: string; minApp?: string }): Mismatch | null {
  if (server.minApp && newerVersion(server.minApp, app))
    return { short: "Needs a newer app", text: `This server needs app version ${server.minApp} or newer (you have ${app}). Update the app to sync with it again.` };
  if (newerVersion(MIN_SERVER, server.version))
    return {
      short: "Server too old",
      text: `This server runs vfm-server ${server.version}; this app needs ${MIN_SERVER} or newer. Ask its owner to update it.`,
    };
  return null;
}
