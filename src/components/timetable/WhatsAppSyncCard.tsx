import { useState } from "react";
import {
  parseWhatsAppDump,
  parseCSV,
  parseJSONTimetable,
  sortEntries,
} from "@/lib/timetable-parser";
import { parseExtractedRows } from "@/lib/timetable-ocr";
import type { TimetableEntry } from "@/lib/timetable-types";

type Props = {
  onAdd: (entries: TimetableEntry[], source: "whatsapp") => void;
  lastSynced?: string;
};

const EXAMPLE = `Monday 09:00-10:00 Maths
Tuesday 10:00-11:00 English Literature
Wednesday 13:00-14:30 Physics Lab
Thursday 09:00-10:00 History
Friday 11:00-12:00 Chemistry`;

export default function WhatsAppSyncCard({ onAdd, lastSynced }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);

  const handleParse = (parser: (t: string) => TimetableEntry[]) => {
    setError(null);
    setSuccess(null);
    const parsed = sortEntries(parser(text));
    if (parsed.length === 0) {
      setError(
        "Couldn't detect any classes. Make sure each line has a day and a time range (e.g. 'Monday 09:00-10:00 Maths').",
      );
      return;
    }
    onAdd(parsed, "whatsapp");
    setSuccess(parsed.length);
    setText("");
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setText(content);
      if (file.name.toLowerCase().endsWith(".json")) {
        handleParse(parseJSONTimetable);
      } else {
        handleParse(parseCSV);
      }
    };
    reader.readAsText(file);
  };

  const [imgBusy, setImgBusy] = useState(false);
  const handleImage = async (file: File) => {
    setImgBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `OCR failed: ${res.status}`);
      }
      const data = (await res.json()) as { rows: string[]; text: string };
      if (data.rows.length === 0) {
        setError("No timetable rows detected in that image.");
        return;
      }
      handleParse((t) => parseWhatsAppDump(data.text || t));
    } catch (e) {
      setError(String(e));
    } finally {
      setImgBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-wide uppercase text-foreground">
            WhatsApp school group
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Paste a forwarded timetable dump. We auto-detect day + time.
          </p>
          {lastSynced && (
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Last synced {formatRelative(lastSynced)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setText(EXAMPLE)}
            className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Insert example
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste WhatsApp message…"
        rows={6}
        className="w-full resize-none rounded-md border border-border/40 bg-background/40 px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => handleParse(parseWhatsAppDump)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Parse message
        </button>
        <button
          onClick={() => handleParse(parseCSV)}
          className="rounded-md border border-border/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
        >
          Parse CSV
        </button>
        <button
          onClick={() => handleParse(parseJSONTimetable)}
          className="rounded-md border border-border/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
        >
          Parse JSON
        </button>
        <label className="rounded-md border border-border/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 cursor-pointer">
          Upload file
          <input
            type="file"
            accept=".csv,.txt,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        <label className={"rounded-md border border-border/40 px-3 py-1.5 text-xs font-medium hover:bg-muted/40 cursor-pointer " + (imgBusy ? "opacity-50 pointer-events-none" : "text-foreground")}>
          {imgBusy ? "Reading…" : "Read image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImage(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-rose-400">{error}</p>
      )}
      {success !== null && (
        <p className="text-xs text-emerald-400">
          Added {success} class{success === 1 ? "" : "es"}.
        </p>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
