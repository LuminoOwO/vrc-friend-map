// Whether the beta UI is the one showing right now (the setting is on and the
// app wasn't started with --classic-ui). Set by App; read by shared code that
// opens a different screen in each UI.
let active = false;
export function setBetaActive(v: boolean) {
  active = v;
}
export function betaActive(): boolean {
  return active;
}
