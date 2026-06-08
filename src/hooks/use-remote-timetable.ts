import { useEffect, useState, useCallback } from "react";
import type { TimetableEntry } from "@/lib/timetable-types";

type BotStatus = {
  running: boolean;
  lastSyncAt: string | null;
  lastSyncStats: { added: number; updated: number; messages: number } | null;
  nextSyncIn: number | null;
};

type State = {
  entries: TimetableEntry[];
  loading: boolean;
  error: string | null;
  botStatus: BotStatus | null;
  syncing: boolean;
  lastSync: string | null;
};

export function useRemoteTimetable() {
  const [state, setState] = useState<State>({
    entries: [],
    loading: true,
    error: null,
    botStatus: null,
    syncing: false,
    lastSync: null,
  });

  const refresh = useCallback(async () => {
    try {
      const [entriesRes, statusRes] = await Promise.all([
        fetch("/api/entries"),
        fetch("/api/bot/status"),
      ]);
      const entriesData = (await entriesRes.json()) as { entries: TimetableEntry[] };
      const botStatus = (await statusRes.json()) as BotStatus;
      setState((s) => ({
        ...s,
        entries: entriesData.entries ?? [],
        botStatus,
        lastSync: botStatus.lastSyncAt,
        loading: false,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: String(err),
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const addEntries = useCallback(
    async (
      entries: TimetableEntry[],
      source: "whatsapp" | "personal",
    ): Promise<{ added: number; updated: number }> => {
      const tagged = entries.map((e) => ({ ...e, source }));
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: tagged }),
      });
      if (!res.ok) throw new Error(`add failed: ${res.status}`);
      const data = (await res.json()) as { added: number; updated: number };
      await refresh();
      return data;
    },
    [refresh],
  );

  const parseAndAdd = useCallback(
    async (
      text: string,
      format: "whatsapp" | "csv" | "json",
      source: "whatsapp" | "personal" = "whatsapp",
    ) => {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, format, source }),
      });
      if (!res.ok) throw new Error(`parse failed: ${res.status}`);
      const data = (await res.json()) as { added: number; updated: number };
      await refresh();
      return data;
    },
    [refresh],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      await fetch(`/api/entries/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [refresh],
  );

  const triggerSync = useCallback(async () => {
    setState((s) => ({ ...s, syncing: true }));
    try {
      const res = await fetch("/api/bot/sync", { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `sync failed: ${res.status}`);
      }
      await refresh();
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }, [refresh]);

  return {
    ...state,
    refresh,
    addEntries,
    parseAndAdd,
    removeEntry,
    triggerSync,
  };
}
