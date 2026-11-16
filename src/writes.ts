// Queue for writes to VRChat (notes, invites, favorites, group actions…):
// one at a time, at least 3.5 s apart (the Rust side refuses writes closer
// than 3 s), each logged in the sync log when it fails.
import { backend, type ApiResponse } from "./backend";
import { logSync } from "./synclog";

type Job = { method: "POST" | "PUT" | "DELETE"; path: string; body?: Record<string, unknown>; label: string; resolve: (r: ApiResponse) => void; reject: (e: unknown) => void };

const queue: Job[] = [];
let running = false;
let lastAt = 0;
const GAP = 3500;

export function vrcWrite(method: Job["method"], path: string, body?: Record<string, unknown>, label = `${method} ${path}`): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    queue.push({ method, path, body, label, resolve, reject });
    void pump();
  });
}

/** Writes still waiting (for "N changes waiting" hints). */
export function pendingWrites(): number {
  return queue.length + (running ? 1 : 0);
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      const wait = lastAt + GAP - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastAt = Date.now();
      try {
        let r = await backend.vrcWrite(job.method, job.path, job.body);
        if (r.status === 429) {
          await new Promise((res) => setTimeout(res, (r.retry_after ?? 30) * 1000));
          lastAt = Date.now();
          r = await backend.vrcWrite(job.method, job.path, job.body);
        }
        if (r.status >= 400) logSync({ area: "VRChat", step: job.label, result: "failed", detail: `${job.path}: ${r.status} ${errorText(r)}`, status: r.status });
        job.resolve(r);
      } catch (e) {
        logSync({ area: "VRChat", step: job.label, result: "failed", detail: String(e) });
        job.reject(e);
      }
    }
  } finally {
    running = false;
  }
}

export function errorText(r: ApiResponse): string {
  const d = r.data as { error?: { message?: string }; message?: string } | string | null;
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 200);
  return d.error?.message ?? d.message ?? "";
}
