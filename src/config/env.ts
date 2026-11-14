import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  botToken: required("BOT_TOKEN"),
  groupChatId: Number(required("GROUP_CHAT_ID")),
  firebaseProjectId: required("FIREBASE_PROJECT_ID"),
  firebaseServiceAccountJson: required("FIREBASE_SERVICE_ACCOUNT_JSON"),
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "UTC",
  port: process.env.PORT ? Number(process.env.PORT) : null,
  // The Home Assistant panel (Ingress); unset means no panel.
  ingressPort: process.env.INGRESS_PORT ? Number(process.env.INGRESS_PORT) : null,
  // Where weekly backups are also saved (the add-on sets /data/backups);
  // unset means Telegram only.
  backupDir: process.env.BACKUP_DIR || null,
};

if (Number.isNaN(env.groupChatId)) {
  throw new Error("GROUP_CHAT_ID must be a valid integer");
}
