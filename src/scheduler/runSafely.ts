import type { Api } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { notifyAdmins } from "../services/notifications.js";

// Reason shown to admins: the message only — never the error object, which
// may carry request details.
function failureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

/**
 * Runs a background job (cron tick or startup catch-up). A rejected promise
 * from a cron tick would crash the process, so errors are logged instead —
 * and admins are told in DM, since a failed job otherwise goes unnoticed
 * (e.g. the weekly poll simply never appears).
 */
export async function runSafely(api: Api, name: string, job: () => Promise<void>): Promise<void> {
  try {
    await job();
  } catch (err) {
    console.error(`[scheduler] ${name} failed:`, err);
    try {
      const config = await getGroupConfig();
      await notifyAdmins(
        api,
        config.groupChatId,
        `⚠️ Не получилось: ${name}. ${failureReason(err)}\nПодробности — в логах бота.`,
      );
    } catch (notifyErr) {
      console.error("[scheduler] Failed to tell admins about the failure:", notifyErr);
    }
  }
}
