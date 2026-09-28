// Loaded with --import before any test module, so env.ts sees these values.
// FIRESTORE_EMULATOR_HOST comes from `firebase emulators:exec`.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Integration tests need the Firestore emulator: run `npm run test:integration`.");
}
process.env.BOT_TOKEN = "test-token";
process.env.GROUP_CHAT_ID = "-1001000";
process.env.FIREBASE_PROJECT_ID = "demo-ride-bot";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
process.env.DEFAULT_TIMEZONE = "Europe/Moscow";
