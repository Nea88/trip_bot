import { editSuggestionText, findByNormalizedText, getById } from "./suggestions.js";
import { normalizeSuggestionText, validateSuggestionText } from "../utils/suggestionText.js";
import type { SuggestionStatus, SuggestionWithId } from "../types/index.js";

export type RenameResult =
  | { kind: "renamed"; place: SuggestionWithId; oldText: string }
  | { kind: "unchanged" }
  | { kind: "invalid"; error: string }
  | { kind: "duplicate"; seq: number; text: string }
  | { kind: "not_found" };

/**
 * New text for a place, with the same rules as /suggest: valid text, no two
 * places with the same name. /edit renames only places in the pool; the
 * Home Assistant panel also those already excluded.
 */
export async function renamePlace(
  id: string,
  newText: string,
  allowed: SuggestionStatus[] = ["active"],
): Promise<RenameResult> {
  const text = newText.trim().replace(/\s+/g, " ");
  const error = validateSuggestionText(text);
  if (error) return { kind: "invalid", error };

  const place = await getById(id);
  if (!place || !allowed.includes(place.status)) return { kind: "not_found" };
  if (place.text === text) return { kind: "unchanged" };

  const duplicate = await findByNormalizedText(normalizeSuggestionText(text));
  if (duplicate && duplicate.id !== place.id) return { kind: "duplicate", seq: duplicate.seq, text: duplicate.text };

  await editSuggestionText(place.id, text);
  return { kind: "renamed", place: { ...place, text, textNormalized: normalizeSuggestionText(text) }, oldText: place.text };
}
