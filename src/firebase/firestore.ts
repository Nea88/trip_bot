import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "../config/env.js";

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(env.firebaseServiceAccountJson);
  initializeApp({
    credential: cert(serviceAccount),
    projectId: env.firebaseProjectId,
  });
}

export const db = getFirestore();
