import { pluralRu } from "./plural.js";

/**
 * Сервантопроходимость: how passable the route to a place is for "сервант" —
 * the group's Honda CR-V, taken in a vacuum (stock car, no allowance for the
 * driver or the weather). Rated by members after the trip; the road, not the
 * place itself. Higher is easier.
 */
export const SERVANT_LEVELS: Record<number, string> = {
  1: "«я же кроссовер», — сказал сервант и остался на асфальте. Дальше пешком",
  2: "прорвались, но сервант требует мойку, психолога и извинений",
  3: "звенит посудой на каждой кочке и впервые вспомнил, зачем ему полный привод",
  4: "справился и уже всем рассказывает, что он внедорожник",
  5: "асфальт до самого крыльца — естественная среда обитания серванта",
};

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= MIN_SCORE && score <= MAX_SCORE;
}

export interface ServantSummary {
  average: number;
  count: number;
}

export function summarize(scores: number[]): ServantSummary | null {
  if (scores.length === 0) return null;
  return { average: scores.reduce((sum, s) => sum + s, 0) / scores.length, count: scores.length };
}

// "3.4" — one decimal, dropped when whole ("4").
function formatAverage(average: number): string {
  return String(Math.round(average * 10) / 10);
}

// "3.4 из 5 (7 оценок)".
export function formatSummary(summary: ServantSummary): string {
  return `${formatAverage(summary.average)} из ${MAX_SCORE} (${summary.count} ${pluralRu(summary.count, ["оценка", "оценки", "оценок"])})`;
}

// Suffix for /list: " 🚙3.4", or nothing if nobody rated the route yet.
export function servantBadge(summary: ServantSummary | null | undefined): string {
  return summary ? ` 🚙${formatAverage(summary.average)}` : "";
}

// The post under the trip announcement; plain text, the buttons carry 1–5.
export function ratingPromptText(placeText: string, summary: ServantSummary | null): string {
  const levels = Object.entries(SERVANT_LEVELS).map(([score, label]) => `${score} — ${label}`);
  return [
    `🚙 Ну что, сервант справился? Оцените сервантопроходимость маршрута «${placeText}» (Honda CR-V в вакууме):`,
    ...levels,
    "",
    summary ? `Средняя: ${formatSummary(summary)}` : "Оценок пока нет.",
  ].join("\n");
}
