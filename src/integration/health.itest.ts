import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../firebase/firestore.js";
import { firestoreHealthy, setFirestoreProbe } from "../services/health.js";

afterEach(() => setFirestoreProbe(() => db.collection("config").doc("main").get()));

test("Firestore check passes against the emulator", async () => {
  setFirestoreProbe(() => db.collection("config").doc("main").get());
  assert.equal(await firestoreHealthy(0), true);
});

test("a failing or hanging Firestore is reported unhealthy", async () => {
  setFirestoreProbe(async () => {
    throw new Error("UNAVAILABLE");
  });
  assert.equal(await firestoreHealthy(0), false);

  setFirestoreProbe(() => new Promise(() => {}), 50);
  assert.equal(await firestoreHealthy(0), false);
});

test("the result is cached for a minute", async () => {
  let reads = 0;
  setFirestoreProbe(async () => {
    reads++;
  });
  await firestoreHealthy(0);
  await firestoreHealthy(30_000);
  assert.equal(reads, 1);
  await firestoreHealthy(61_000);
  assert.equal(reads, 2);
});
