import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { GeoPointDoc, GeoPromptDoc } from "../types/index.js";
import type { GeoPoint } from "../utils/routeMap.js";
import { normalizePlaceName } from "../utils/routeText.js";

// Points the owner gave for names the geocoder couldn't find, and the
// questions about them still waiting for an answer.
const geoPoints = db.collection("geoPoints");
const geoPrompts = db.collection("geoPrompts");

// Firestore doc ids can't contain "/".
function key(name: string): string {
  return normalizePlaceName(name).replace(/\//g, "_") || "_";
}

export async function getGeoPoint(name: string): Promise<GeoPoint | null> {
  const snap = await geoPoints.doc(key(name)).get();
  if (!snap.exists) return null;
  const doc = snap.data() as GeoPointDoc;
  return { lat: doc.lat, lon: doc.lon };
}

export async function setGeoPoint(name: string, point: GeoPoint, setByUserId: number): Promise<void> {
  await geoPoints.doc(key(name)).set({
    name,
    lat: point.lat,
    lon: point.lon,
    setByUserId,
    setAt: FieldValue.serverTimestamp(),
  });
}

export async function getGeoPrompt(name: string): Promise<GeoPromptDoc | null> {
  const snap = await geoPrompts.doc(key(name)).get();
  return snap.exists ? (snap.data() as GeoPromptDoc) : null;
}

export async function saveGeoPrompt(name: string, placeText: string, chatId: number, messageId: number): Promise<void> {
  await geoPrompts.doc(key(name)).set({
    name,
    placeText,
    chatId,
    messageId,
    askedAt: FieldValue.serverTimestamp(),
  });
}

export async function findGeoPromptByMessage(chatId: number, messageId: number): Promise<GeoPromptDoc | null> {
  const snap = await geoPrompts.where("messageId", "==", messageId).get();
  const doc = snap.docs.map((d) => d.data() as GeoPromptDoc).find((p) => p.chatId === chatId);
  return doc ?? null;
}

export async function deleteGeoPrompt(name: string): Promise<void> {
  await geoPrompts.doc(key(name)).delete();
}
