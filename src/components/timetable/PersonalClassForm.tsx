import { useState } from "react";
import type {
  DayOfWeek,
  TimetableEntry,
} from "@/lib/timetable-types";
import { DAYS, colorForSubject } from "@/lib/timetable-types";

type Props = {
  onAdd: (entries: TimetableEntry[]) => void;
};

export default function PersonalClassForm({ onAdd }: Props) {
  const [subject, setSubject] = useState("");
  const [day, setDay] = useState<DayOfWeek>("Monday");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    if (endTime <= startTime) return;
    const entry: TimetableEntry = {
      id: crypto.randomUUID(),
      subject: subject.trim(),
      day,
      startTime,
      endTime,
      location: location.trim() || undefined,
      source: "personal",
      color: colorForSubject(subject),
    };
    onAdd([entry]);
    setSubject("");
    setLocation("");
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold tracking-wide uppercase text-foreground">
          Personal / other classes
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Add tuition, coaching, or other recurring classes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-muted-foreground flex flex-col gap-1">
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Piano"
            className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Day
          <select
            value={day}
            onChange={(e) => setDay(e.target.value as DayOfWeek)}
            className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Start
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            End
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </label>
        </div>
        <label className="col-span-2 text-xs text-muted-foreground flex flex-col gap-1">
          Location (optional)
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Room 12"
            className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </label>
      </div>

      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        Add class
      </button>
    </form>
  );
}
