import { IANAZone } from "luxon";

const DAY_NAMES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function parseDayOfWeek(input: string): number | null {
  const key = input.trim().toLowerCase();
  return key in DAY_NAMES ? DAY_NAMES[key] : null;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(input: string): boolean {
  return TIME_RE.test(input.trim());
}

export function isValidTimezone(input: string): boolean {
  return IANAZone.isValidZone(input.trim());
}

export function parseTime(input: string): { hour: number; minute: number } | null {
  const match = TIME_RE.exec(input.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export type WeeklySchedule = { day: number; time: string; timezone: string };

/**
 * Parses "<day> <HH:MM> [timezone]" as used by /set_schedule and
 * /set_close_schedule. Returns an error text (without usage) on bad input.
 */
export function parseWeeklySchedule(
  text: string,
  defaultTimezone: string,
): WeeklySchedule | { error: string } {
  const args = text.trim().split(/\s+/).filter(Boolean);
  if (args.length !== 2 && args.length !== 3) return { error: "" };
  const [dayArg, timeArg, tzArg = defaultTimezone] = args;
  const day = parseDayOfWeek(dayArg);
  if (day === null) return { error: `Не распознан день недели "${dayArg}".` };
  if (!isValidTime(timeArg)) return { error: `Неверный формат времени "${timeArg}", ожидается ЧЧ:ММ.` };
  if (!isValidTimezone(tzArg)) return { error: `Неизвестная таймзона "${tzArg}".` };
  return { day, time: timeArg, timezone: tzArg };
}
