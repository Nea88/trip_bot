import { db } from "../firebase/firestore.js";

// The watchdog polls often; one Firestore read per minute is plenty.
const CACHE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 5_000;

type Probe = () => Promise<unknown>;

let probe: Probe = () => db.collection("config").doc("main").get();
let timeoutMs = DEFAULT_TIMEOUT_MS;
let last = { at: -Infinity, ok: true };

// Tests swap the probe (and shorten the timeout) to simulate an outage.
export function setFirestoreProbe(fn: Probe, timeout = DEFAULT_TIMEOUT_MS): void {
  probe = fn;
  timeoutMs = timeout;
  last = { at: -Infinity, ok: true };
}

/** Whether a small Firestore read succeeds in time; cached for a minute. */
export async function firestoreHealthy(nowMs = Date.now()): Promise<boolean> {
  if (nowMs - last.at < CACHE_MS) return last.ok;
  let ok: boolean;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    ok = true;
  } catch (err) {
    console.error("[health] Firestore check failed:", err instanceof Error ? err.message : err);
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  last = { at: nowMs, ok };
  return ok;
}
