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
  // Telegram username, or the first name when the user has none.
  addedByUsername: string;
  // false when addedByUsername is a first name; missing on suggestions added
  // before this field existed (treated as a real username).
  addedByHasUsername?: boolean;
  addedAt: Timestamp;
  status: SuggestionStatus;
  excludedAt: Timestamp | null;
  restoredAt: Timestamp | null;
  rejectedAt: Timestamp | null;
  // Approved trip photos attached to this place; missing means 0.
  photoCount?: number;
}

export interface SuggestionWithId extends Suggestion {
  id: string;
}

// Photos (or any other messages) from past trips, attached to a place via /photo. Non-admin
// submissions start "pending" and are approved/rejected by an admin as a
// whole batch (one /photo = one batch, e.g. a whole album).
export type PlacePhotoStatus = "pending" | "approved" | "rejected";

export interface PlacePhoto {
  suggestionId: string;
  // Telegram keeps the file; fileId is enough to send it again. Both are null
  // for a non-photo message (text, video, file…), which is known only by its
  // source message.
  fileId: string | null;
  // Stable across re-sends — used for de-duplication and /unphoto.
  fileUniqueId: string | null;
  sourceChatId: number;
  sourceMessageId: number;
  batchId: string;
  addedByUserId: number;
  addedByUsername: string;
  addedByHasUsername: boolean;
  addedAt: Timestamp;
  status: PlacePhotoStatus;
  reviewedAt: Timestamp | null;
}

export interface PlacePhotoWithId extends PlacePhoto {
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
  // Message with the confirm/cancel buttons for pendingResult; missing on
  // polls closed before this field existed.
  pendingResultMessageId?: number | null;
  // ISO date of the Saturday the trip happened, set when the admin confirms
  // where the group went; missing on polls confirmed before it existed.
  tripDate?: string | null;
  // Start time ("HH:MM") and meeting point of the Saturday ride, set by an
  // admin with /meet while the poll is open.
  meetTime?: string | null;
  meetPlace?: string | null;
  // Coordinates when /meet replied to a location; used for the map pin and forecast.
  meetLatitude?: number | null;
  meetLongitude?: number | null;
}

export interface PollDocWithId extends PollDoc {
  id: string;
}

// A member's current answer in one of our polls (from Telegram poll_answer
// updates; the poll is non-anonymous). Doc id: `${pollId}_${userId}`.
// "Went on the trip" = voted for the place the group was confirmed to go to.
export interface PollVote {
  pollId: string;
  userId: number;
  username: string;
  hasUsername: boolean;
  // Indexes into the poll's optionSuggestionIds.
  optionIndexes: number[];
  updatedAt: Timestamp;
}

export interface GroupConfig {
  groupChatId: number;
  scheduleDay: number | null;
  scheduleTime: string | null;
  // When /set_schedule was last run; missing on configs from before it existed.
  scheduleSetAt?: Timestamp | null;
  // Weekly auto-close of the open poll (/set_close_schedule); missing = off.
  closeScheduleDay?: number | null;
  closeScheduleTime?: string | null;
  closeScheduleSetAt?: Timestamp | null;
  reminderTime: string | null;
  // null means "use DEFAULT_REMINDER_TEXT".
  reminderText: string | null;
  // ISO date (YYYY-MM-DD, in DEFAULT_TIMEZONE) of the last sent reminder.
  // Used to send the reminder every other day instead of daily.
  lastReminderSentDate: string | null;
  // ISO date (in DEFAULT_TIMEZONE) of the last "on this day" trip memories
  // post; missing until the first one.
  lastMemoriesSentDate?: string | null;
  // Year whose summary was already handled (posted, or skipped: no trips).
  lastYearSummaryYear?: number | null;
  // ISO timestamp of the last successful weekly backup.
  lastBackupAt?: string | null;
  updatedAt: Timestamp;
}

export interface AdminRegistration {
  dmChatId: number;
  username: string;
  registeredAt: Timestamp;
}
