import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { TimetableEntry, TimetableSource } from "./timetable-types";
import { colorForSubject } from "./timetable-types";

// Default DB path is alongside this package. Can be overridden with TIMETABLE_DB_PATH
// so the bot service (running from a different cwd) and the site share the same file.
const DEFAULT_DB_PATH = resolve(import.meta.dir, "../../timetable.sqlite");
const DB_PATH = process.env.TIMETABLE_DB_PATH || DEFAULT_DB_PATH;

if (!existsSync(dirname(DB_PATH))) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

// One process holds a writer; the rest open read-only. WAL mode keeps them in sync.
const READONLY = process.env.TIMETABLE_READONLY === "1";
const db = READONLY
  ? new Database(DB_PATH, { readonly: true })
  : new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    subject TEXT NOT NULL,
    location TEXT,
    source TEXT NOT NULL,
    color TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_day ON entries(day)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source)`);

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Row = {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
  subject: string;
  location: string | null;
  source: string;
  color: string | null;
};

function rowToEntry(row: Row): TimetableEntry {
  return {
    id: row.id,
    day: row.day as TimetableEntry["day"],
    startTime: row.start_time,
    endTime: row.end_time,
    subject: row.subject,
    location: row.location ?? undefined,
    source: row.source as TimetableSource,
    color: row.color ?? undefined,
  };
}

function entryToParams(e: TimetableEntry): (string | null)[] {
  return [
    e.id,
    e.day,
    e.startTime,
    e.endTime,
    e.subject,
    e.location ?? null,
    e.source,
    e.color ?? null,
  ];
}

export function getAllEntries(): TimetableEntry[] {
  const rows = db
    .query<Row, []>(
      "SELECT id, day, start_time, end_time, subject, location, source, color FROM entries",
    )
    .all();
  return rows.map(rowToEntry).sort((a, b) => {
    const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });
}

export function entryCount(source?: TimetableSource): number {
  if (source) {
    return db
      .query<{ c: number }, [string]>(
        "SELECT COUNT(*) as c FROM entries WHERE source = ?",
      )
      .get(source)!.c;
  }
  return db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM entries").get()!.c;
}

export type UpsertResult = { added: number; updated: number };

export function upsertEntries(entries: TimetableEntry[]): UpsertResult {
  if (READONLY) {
    return { added: 0, updated: 0 };
  }
  let added = 0;
  let updated = 0;
  const insert = db.prepare(
    `INSERT INTO entries (id, day, start_time, end_time, subject, location, source, color, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       day = excluded.day,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       subject = excluded.subject,
       location = excluded.location,
       source = excluded.source,
       color = excluded.color,
       updated_at = datetime('now')`,
  );
  const exists = db.prepare<{ c: number }, [string]>(
    "SELECT COUNT(*) as c FROM entries WHERE id = ?",
  );
  const tx = db.transaction((batch: TimetableEntry[]) => {
    for (const raw of batch) {
      const e: TimetableEntry = {
        ...raw,
        color: raw.color ?? colorForSubject(raw.subject),
      };
      const was = exists.get(e.id)?.c ?? 0;
      insert.run(...entryToParams(e));
      if (was) updated += 1;
      else added += 1;
    }
  });
  tx(entries);
  return { added, updated };
}

export function removeEntry(id: string): boolean {
  if (READONLY) return false;
  const r = db.prepare("DELETE FROM entries WHERE id = ?").run(id);
  return r.changes > 0;
}

export function clearSource(source: TimetableSource): number {
  if (READONLY) return 0;
  const r = db.prepare("DELETE FROM entries WHERE source = ?").run(source);
  return r.changes;
}
