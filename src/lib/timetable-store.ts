import { useEffect, useState, useCallback } from "react";
import type { TimetableEntry } from "./timetable-types";

const STORAGE_KEY = "zo.timetable.v1";
const WA_KEY = "zo.timetable.wa.lastSynced";
const PERSONAL_KEY = "zo.timetable.personal.lastSynced";

type StoredState = {
  entries: TimetableEntry[];
};

function loadFromStorage(): StoredState {
  if (typeof localStorage === "undefined")
    return { entries: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as StoredState;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function loadTimestamp(key: string): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage.getItem(key) ?? undefined;
}

export function useTimetable() {
  const [entries, setEntries] = useState<TimetableEntry[]>(() =>
    loadFromStorage().entries,
  );
  const [whatsappLastSynced, setWhatsappLastSynced] = useState<string | undefined>(
    () => loadTimestamp(WA_KEY),
  );
  const [personalLastSynced, setPersonalLastSynced] = useState<
    string | undefined
  >(() => loadTimestamp(PERSONAL_KEY));

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }));
  }, [entries]);

  const addEntries = useCallback(
    (newEntries: TimetableEntry[], source: "whatsapp" | "personal") => {
      setEntries((prev) => {
        // For whatsapp sync, replace existing whatsapp entries with the new set
        // (assumes the dump is the latest authoritative version of the school's
        // timetable). For personal, simply append.
        if (source === "whatsapp") {
          const others = prev.filter((e) => e.source !== "whatsapp");
          return [...others, ...newEntries];
        }
        return [...prev, ...newEntries];
      });
      const now = new Date().toISOString();
      if (source === "whatsapp") {
        setWhatsappLastSynced(now);
        if (typeof localStorage !== "undefined")
          localStorage.setItem(WA_KEY, now);
      } else {
        setPersonalLastSynced(now);
        if (typeof localStorage !== "undefined")
          localStorage.setItem(PERSONAL_KEY, now);
      }
    },
    [],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  return {
    entries,
    addEntries,
    removeEntry,
    clear,
    whatsappLastSynced,
    personalLastSynced,
  };
}
