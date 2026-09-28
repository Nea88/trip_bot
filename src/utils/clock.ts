import { DateTime } from "luxon";

let provider: () => DateTime = () => DateTime.now();

// Current time. Everything date-dependent (trip dates, catch-ups, reminders)
// goes through this, so tests can pin "now" with setClock.
export function now(): DateTime {
  return provider();
}

export function setClock(fn: () => DateTime): void {
  provider = fn;
}

export function resetClock(): void {
  provider = () => DateTime.now();
}
