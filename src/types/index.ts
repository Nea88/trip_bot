import type { Timestamp } from "firebase-admin/firestore";

// New suggestions start "pending" (awaiting admin review) until approved
// ("active") or turned down ("rejected" — kept around so the same text can't
// be resubmitted, unlike a hard /delete).
export type SuggestionStatus = "pending" | "active" | "excluded" | "rejected";

export interface Suggestion {
  seq: number;
  text: string;
  // Lowercased/trimmed/whitespace-collapsed text, used for duplicate detection.
  textNormalized: string;
  addedByUserId: number;
  addedByUsername: string;
  addedAt: Timestamp;
  status: SuggestionStatus;
  excludedAt: Timestamp | null;
  restoredAt: Timestamp | null;
  rejectedAt: Timestamp | null;
}

export interface SuggestionWithId extends Suggestion {
  id: string;
}

export type PollStatus = "open" | "closed";

export interface PendingResult {
  // Never includes the mandatory "Мимокрокодил" (skip) option — it can't win.
  candidateSuggestionIds: string[];
  voterCounts: number[];
}

export interface PollDoc {
  telegramPollId: string;
  messageId: number;
  groupChatId: number;
  // null represents the mandatory "Мимокрокодил" (skip) option.
  optionSuggestionIds: (string | null)[];
  createdAt: Timestamp;
  closedAt: Timestamp | null;
  status: PollStatus;
  winnerSuggestionId: string | null;
  pendingResult: PendingResult | null;
}

export interface PollDocWithId extends PollDoc {
  id: string;
}

export interface GroupConfig {
  groupChatId: number;
  scheduleDay: number | null;
  scheduleTime: string | null;
  timezone: string | null;
  reminderTime: string | null;
  reminderTimezone: string | null;
  // null means "use DEFAULT_REMINDER_TEXT".
  reminderText: string | null;
  updatedAt: Timestamp;
}

export interface AdminRegistration {
  dmChatId: number;
  username: string;
  registeredAt: Timestamp;
}
