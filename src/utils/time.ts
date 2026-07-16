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
