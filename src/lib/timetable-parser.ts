import type {
  DayOfWeek,
  TimetableEntry,
  TimetableSource,
} from "./timetable-types";
import { colorForSubject, timeToMinutes } from "./timetable-types";

const DAY_ALIASES: Record<string, DayOfWeek> = {
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  weds: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
  sunday: "Sunday",
};

const DAY_PATTERN = new RegExp(
  `\\b(${[...new Set(Object.keys(DAY_ALIASES))].join("|")})\\b`,
  "i",
);

const TIME_PATTERN =
  /(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?/i;

function detectDay(line: string): DayOfWeek | null {
  const match = line.match(DAY_PATTERN);
  if (!match) return null;
  return DAY_ALIASES[match[1].toLowerCase()] ?? null;
}

function buildEntry(
  day: DayOfWeek,
  startH: number,
  startM: number,
  endH: number,
  endM: number,
  subject: string,
  source: TimetableSource,
): TimetableEntry {
  const sh = String(startH).padStart(2, "0");
  const sm = String(startM).padStart(2, "0");
  const eh = String(endH).padStart(2, "0");
  const em = String(endM).padStart(2, "0");
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    day,
    startTime: `${sh}:${sm}`,
    endTime: `${eh}:${em}`,
    subject: subject.trim() || "Untitled",
    source,
    color: colorForSubject(subject),
  };
}

/**
 * Parse a free-form text dump (e.g. a WhatsApp message) and try to extract
 * timetable-like rows. Heuristics: any line with a day keyword, a time range
 * like 09:00-10:00 or 9-10, and a subject name.
 */
export function parseWhatsAppDump(text: string): TimetableEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: TimetableEntry[] = [];

  for (const raw of lines) {
    const line = raw.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
    if (line.length < 4) continue;
    const day = detectDay(line);
    if (!day) continue;
    const time = line.match(TIME_PATTERN);
    if (!time) continue;
    const startH = parseInt(time[1], 10);
    const startM = time[2] ? parseInt(time[2], 10) : 0;
    const endH = parseInt(time[3], 10);
    const endM = time[4] ? parseInt(time[4], 10) : 0;

    // Subject = everything after the time range, minus punctuation like
    // trailing location markers (room numbers etc.).
    let subject = line
      .slice((time.index ?? 0) + time[0].length)
      .replace(/^[\s\-–—:|]+/, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    // Strip common trailing location/teacher annotations
    subject = subject
      .replace(/\b(room|rm|hall|lab)\s*\d+/i, "")
      .replace(/\bwith\s+[A-Z][a-z]+/i, "")
      .replace(/\([^)]{0,40}\)/g, "")
      .trim();

    if (!subject) continue;
    if (endH * 60 + endM <= startH * 60 + startM) continue;
    entries.push(buildEntry(day, startH, startM, endH, endM, subject, "whatsapp"));
  }

  return entries;
}

/**
 * Parse a simple CSV. First line is a header: day,start,end,subject,location
 * or day,start,end,subject.
 */
export function parseCSV(text: string): TimetableEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("day") || first.includes("subject");
  const rows = hasHeader ? lines.slice(1) : lines;
  const entries: TimetableEntry[] = [];
  for (const row of rows) {
    const cells = row.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 4) continue;
    const day = detectDay(cells[0]) ?? (cells[0] as DayOfWeek);
    if (!DAYS.includes(day as DayOfWeek)) continue;
    const startH = parseInt(cells[1].split(":")[0] ?? cells[1], 10);
    const startM = parseInt(cells[1].split(":")[1] ?? "0", 10) || 0;
    const endH = parseInt(cells[2].split(":")[0] ?? cells[2], 10);
    const endM = parseInt(cells[2].split(":")[1] ?? "0", 10) || 0;
    const subject = cells[3] || "Untitled";
    const location = cells[4] || undefined;
    if (Number.isNaN(startH) || Number.isNaN(endH)) continue;
    if (endH * 60 + endM <= startH * 60 + startM) continue;
    const entry = buildEntry(day, startH, startM, endH, endM, subject, "whatsapp");
    if (location) entry.location = location;
    entries.push(entry);
  }
  return entries;
}

export function parseJSONTimetable(text: string): TimetableEntry[] {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    const entries: TimetableEntry[] = [];
    for (const row of data) {
      const day = detectDay(String(row.day ?? "")) ?? (row.day as DayOfWeek);
      if (!DAYS.includes(day as DayOfWeek)) continue;
      const start = String(row.start ?? row.startTime ?? "");
      const end = String(row.end ?? row.endTime ?? "");
      if (!start || !end) continue;
      const [sH, sM] = start.split(":").map((n: string) => parseInt(n, 10));
      const [eH, eM] = end.split(":").map((n: string) => parseInt(n, 10));
      if (Number.isNaN(sH) || Number.isNaN(eH)) continue;
      if ((eH ?? 0) * 60 + (eM ?? 0) <= (sH ?? 0) * 60 + (sM ?? 0)) continue;
      const entry = buildEntry(
        day,
        sH ?? 0,
        sM ?? 0,
        eH ?? 0,
        eM ?? 0,
        String(row.subject ?? "Untitled"),
        "whatsapp",
      );
      if (row.location) entry.location = String(row.location);
      entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

import { DAYS } from "./timetable-types";

export function sortEntries(entries: TimetableEntry[]): TimetableEntry[] {
  return [...entries].sort((a, b) => {
    const dayDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });
}
