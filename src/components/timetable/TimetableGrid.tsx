import { useEffect, useState } from "react";
import { IconClock, IconMapPin } from "@tabler/icons-react";
import type { TimetableEntry } from "@/lib/timetable-types";
import { DAYS, colorForSubject, timeToMinutes } from "@/lib/timetable-types";

type Props = {
  entries: TimetableEntry[];
  onRemove?: (id: string) => void;
  loading?: boolean;
};

const FIRST_MIN = 8 * 60;
const LAST_MIN = 20 * 60;
const STEP = 30; // half-hour rows
const ROW_PX = 38;

function todayName(): string | null {
  const map = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ] as const;
  return map[new Date().getDay()] ?? null;
}

export default function TimetableGrid({ entries, onRemove, loading }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = todayName();
  const rows: number[] = [];
  for (let m = FIRST_MIN; m <= LAST_MIN; m += STEP) rows.push(m);

  // Index entries by day+start
  const byDayStart: Record<string, Record<number, TimetableEntry[]>> = {};
  for (const e of entries) {
    if (!byDayStart[e.day]) byDayStart[e.day] = {};
    const s = timeToMinutes(e.startTime);
    if (!byDayStart[e.day]![s]) byDayStart[e.day]![s] = [];
    byDayStart[e.day]![s]!.push(e);
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <section
      aria-label="Weekly timetable"
      className="relative overflow-hidden rounded-md border border-border bg-card/60 paper-grain"
    >
      <header className="rule-engraved flex items-center justify-between px-5 pt-5">
        <div className="flex items-baseline gap-3 pt-1">
          <h2 className="font-display text-2xl uppercase tracking-wide text-foreground">
            Weekly Register
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            W·{weekNumber(now)} · {rows.length / 2}h slots
          </span>
        </div>
        <div className="flex items-center gap-3 pt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-primary" /> School
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-personal" /> Personal
          </span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <div
          className="min-w-[860px]"
          style={{ position: "relative" }}
        >
          {/* Day header row */}
          <div
            className="sticky top-0 z-10 grid border-b border-border bg-background/80 backdrop-blur"
            style={{
              gridTemplateColumns: "68px repeat(7, 1fr)",
            }}
          >
            <div className="border-r border-border/60 px-2 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              HR
            </div>
            {DAYS.map((d) => {
              const isToday = d === today;
              return (
                <div
                  key={d}
                  className={`relative border-r border-border/60 px-3 py-3 ${
                    isToday ? "bg-primary/10 tick-mark" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`font-display text-lg uppercase tracking-wider ${
                        isToday ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {d.slice(0, 3)}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {d.slice(3)}
                    </span>
                  </div>
                  {isToday && (
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-primary">
                      ▸ today
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hourly rows with half-hour subdivisions */}
          <div className="relative">
            {rows.map((m, i) => {
              const onHour = m % 60 === 0;
              const hour = Math.floor(m / 60);
              const minutes = m % 60;
              return (
                <div
                  key={m}
                  className="grid border-b border-border/30"
                  style={{
                    gridTemplateColumns: "68px repeat(7, 1fr)",
                    minHeight: ROW_PX,
                  }}
                >
                  <div
                    className={`relative flex flex-col items-end justify-start border-r border-border/60 px-2 pt-1 font-mono ${
                      onHour ? "text-foreground" : "text-muted-foreground/60"
                    }`}
                  >
                    {onHour ? (
                      <span className="text-[11px] tabular-nums">
                        {String(hour).padStart(2, "0")}
                        <span className="text-muted-foreground">:00</span>
                      </span>
                    ) : (
                      <span className="text-[10px] tabular-nums">
                        :{String(minutes).padStart(2, "0")}
                      </span>
                    )}
                  </div>

                  {DAYS.map((d) => {
                    const isToday = d === today;
                    const isPast =
                      isToday && timeToMinutes(`${hour}:${minutes}`) < nowMin - 30;
                    const cellEntries = byDayStart[d]?.[m] ?? [];
                    return (
                      <div
                        key={d}
                        className={`relative border-r border-border/30 p-1 ${
                          isToday ? "bg-primary/[0.04]" : ""
                        } ${isPast ? "opacity-50" : ""} ${
                          onHour ? "border-t border-border/40" : ""
                        }`}
                      >
                        {cellEntries.map((e) => (
                          <ClassCell
                            key={e.id}
                            e={e}
                            onRemove={onRemove}
                            isToday={isToday}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Now-line for today */}
            {today &&
              (() => {
                const mins = now.getHours() * 60 + now.getMinutes();
                if (mins < FIRST_MIN || mins > LAST_MIN) return null;
                const top =
                  ((mins - FIRST_MIN) / STEP) * ROW_PX + ROW_PX / 2;
                const dayIdx = DAYS.indexOf(today as (typeof DAYS)[number]);
                if (dayIdx < 0) return null;
                const colWidthPct = 100 / (1 + DAYS.length);
                return (
                  <div
                    className="pointer-events-none absolute z-20 flex items-center"
                    style={{
                      top,
                      left: `calc(68px + ${dayIdx} * (100% - 68px) / ${DAYS.length})`,
                      width: `calc((100% - 68px) / ${DAYS.length})`,
                    }}
                  >
                    <span className="size-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                    <span className="ml-1 h-px flex-1 bg-primary/70" />
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-primary">
                      now · {String(now.getHours()).padStart(2, "0")}
                      {String(now.getMinutes()).padStart(2, "0")}
                    </span>
                  </div>
                );
              })()}
          </div>
        </div>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/30 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <IconClock className="size-3 animate-spin" /> loading register…
          </div>
        </div>
      )}
    </section>
  );
}

function ClassCell({
  e,
  onRemove,
  isToday,
}: {
  e: TimetableEntry;
  onRemove?: (id: string) => void;
  isToday: boolean;
}) {
  const color = e.color || colorForSubject(e.subject);
  const span = Math.max(
    1,
    Math.round(
      (timeToMinutes(e.endTime) - timeToMinutes(e.startTime)) / 30,
    ),
  );
  return (
    <div
      className="group relative h-full w-full overflow-hidden rounded-sm border-l-2 bg-card/40 px-2 py-1 transition hover:bg-card"
      style={{
        borderLeftColor: color,
        minHeight: ROW_PX * span - 4,
        background: `linear-gradient(180deg, color-mix(in oklch, ${color} 12%, transparent), color-mix(in oklch, ${color} 4%, transparent))`,
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <div
          className="font-display text-sm font-bold uppercase leading-tight tracking-wide"
          style={{ color }}
        >
          {e.subject}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground tabular-nums">
          {e.startTime}–{e.endTime}
        </div>
      </div>
      {e.location && (
        <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] text-muted-foreground/80">
          <IconMapPin className="size-2.5" /> {e.location}
        </div>
      )}
      <div
        className="absolute right-1 top-1 font-mono text-[8px] uppercase tracking-widest opacity-60"
        style={{ color }}
      >
        {e.source === "personal" ? "YOU" : "WTS"}
      </div>
      {onRemove && (
        <button
          onClick={() => onRemove(e.id)}
          className="absolute bottom-0.5 right-1 hidden font-mono text-[8px] uppercase text-muted-foreground hover:text-destructive group-hover:block"
        >
          remove
        </button>
      )}
    </div>
  );
}

function weekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604_800_000);
}
