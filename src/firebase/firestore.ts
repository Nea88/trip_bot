import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "../config/env.js";

if (getApps().length === 0) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Local emulator (npm run test:integration) needs no credentials.
    initializeApp({ projectId: env.firebaseProjectId });
  } else {
    const serviceAccount = JSON.parse(env.firebaseServiceAccountJson);
    initializeApp({
      credential: cert(serviceAccount),
      projectId: env.firebaseProjectId,
    });
  }
}

export const db = getFirestore();
