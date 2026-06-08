export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type TimetableSource = "whatsapp" | "personal";

export type TimetableEntry = {
  id: string;
  day: DayOfWeek;
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  subject: string;
  location?: string;
  source: TimetableSource;
  color?: string;
};

export type TimetableData = {
  entries: TimetableEntry[];
  whatsappLastSynced?: string;
  personalLastSynced?: string;
};

export const DAYS: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DEFAULT_TIME_SLOTS: string[] = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];

// Distinct, restrained palette for class blocks
const SUBJECT_PALETTE = [
  "#d8a657", // marigold
  "#8aa896", // sage
  "#c46a4a", // terracotta
  "#7a8fa8", // slate blue
  "#a36b8c", // mauve
  "#6f8f5e", // moss
  "#b8a07a", // sand
  "#5e7480", // teal grey
  "#9c5d3f", // burnt sienna
  "#867aa3", // lavender
];

export function colorForSubject(subject: string): string {
  const key = subject.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % SUBJECT_PALETTE.length;
  return SUBJECT_PALETTE[idx];
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((s) => parseInt(s, 10));
  return (h || 0) * 60 + (m || 0);
}
