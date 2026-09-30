// Long polling holds each getUpdates call open for up to 30s, but grammY asks
// for the next batch only after handling the current one, and a handler hit
// by 429 may wait out autoRetry (3 × up to 60s, see bot.ts). The window covers
// that, so a flood limit doesn't get the add-on restarted mid-command.
export const HEALTHY_POLL_WINDOW_MS = 240_000;

/** Healthcheck answer for the HA watchdog: 200 only if every part works. */
export function healthStatus(input: {
  botRunning: boolean;
  msSinceLastPoll: number;
  firestoreOk: boolean;
}): { code: number; body: string } {
  const problems: string[] = [];
  if (!input.botRunning || input.msSinceLastPoll >= HEALTHY_POLL_WINDOW_MS) problems.push("telegram polling stalled");
  if (!input.firestoreOk) problems.push("firestore unavailable");
  return problems.length === 0 ? { code: 200, body: "ok" } : { code: 503, body: problems.join("; ") };
}
