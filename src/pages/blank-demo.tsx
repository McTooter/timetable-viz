import { useState, useEffect } from "react";
import {
  IconRocket,
  IconRefresh,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconBrandTelegram,
  IconArrowUpRight,
  IconBolt,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TimetableGrid from "@/components/timetable/TimetableGrid";
import TimetableScene from "@/components/timetable/TimetableScene";
import { PageSkeleton, SceneSkeleton, CardSkeleton } from "@/components/timetable/TimetableSkeleton";
import WhatsAppSyncCard from "@/components/timetable/WhatsAppSyncCard";
import PersonalClassForm from "@/components/timetable/PersonalClassForm";
import { useRemoteTimetable } from "@/hooks/use-remote-timetable";

export default function BlankDemo() {
  const {
    entries,
    loading,
    error,
    botStatus,
    syncing,
    addEntries,
    parseAndAdd,
    removeEntry,
    triggerSync,
  } = useRemoteTimetable();

  if (loading && entries.length === 0) {
    return <PageSkeleton />;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background: noise + corner crosshairs */}
      <div className="noise-bg pointer-events-none fixed inset-0" aria-hidden />
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <Crosshairs />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
        <Header
          syncing={syncing}
          triggerSync={triggerSync}
          botStatus={botStatus}
          loading={loading}
        />

        {error && (
          <div className="mb-6 rounded-sm border border-destructive/50 bg-destructive/5 px-4 py-3 font-mono text-xs text-destructive">
            ✕ Error: {error}
          </div>
        )}

        {/* Editorial hero strip */}
        <div className="mb-6 grid grid-cols-12 items-end gap-4">
          <div className="col-span-12 lg:col-span-7">
            <Badge variant="outline" className="mb-3 border-border">
              <IconRocket className="size-3" /> running on your zo computer
            </Badge>
            <h1 className="font-display text-6xl font-bold uppercase leading-[0.85] tracking-tight md:text-8xl">
              The
              <br />
              <span className="text-primary">Register</span>.
            </h1>
          </div>
          <div className="col-span-12 border-l-2 border-border pl-4 font-serif text-sm italic text-muted-foreground lg:col-span-4 lg:col-start-9">
            <p>
              A weekly timetable, etched in real time. Synced every six hours
              from a Telegram bot fed by your school group; padded with your
              own classes, polished to brass.
            </p>
            <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <IconBolt className="size-3 text-primary" />
              Updated: {formatLong(new Date())}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <KpiStrip entries={entries} botStatus={botStatus} />

        {/* 3D scene — pinned as the hero */}
        <div className="mb-6">
          {loading ? <SceneSkeleton /> : <TimetableScene entries={entries} />}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <TimetableGrid
              entries={entries}
              onRemove={removeEntry}
              loading={loading}
            />
            <AddTelegramHint />
          </div>
          <div className="space-y-6">
            {loading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : (
              <>
                <TelegramIngestCard />
                <WhatsAppSyncCard
                  onAdd={(newEntries) => addEntries(newEntries, "whatsapp")}
                />
                <PersonalClassForm
                  onAdd={(newEntries) => addEntries(newEntries, "personal")}
                />
              </>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </main>
  );
}

function Header({
  syncing,
  triggerSync,
  botStatus,
  loading,
}: {
  syncing: boolean;
  triggerSync: () => void;
  botStatus: ReturnType<typeof useRemoteTimetable>["botStatus"];
  loading: boolean;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center border border-border bg-card">
          <span className="font-display text-lg font-bold text-primary">R</span>
        </div>
        <div>
          <div className="font-display text-base font-semibold uppercase tracking-wider">
            Register · Zant
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            zo · timetable · v1
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <BotStatusBadge status={botStatus} loading={loading} />
        <Button
          variant="outline"
          size="sm"
          onClick={triggerSync}
          disabled={syncing || !botStatus?.running}
          className="font-mono text-[10px] uppercase tracking-widest"
        >
          <IconRefresh
            className={`size-3 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Syncing" : "Sync now"}
        </Button>
      </div>
    </header>
  );
}

function KpiStrip({
  entries,
  botStatus,
}: {
  entries: ReturnType<typeof useRemoteTimetable>["entries"];
  botStatus: ReturnType<typeof useRemoteTimetable>["botStatus"];
}) {
  const school = entries.filter((e) => e.source === "whatsapp").length;
  const personal = entries.filter((e) => e.source === "personal").length;
  const days = new Set(entries.map((e) => e.day)).size;
  const lastSync = botStatus?.lastSyncAt
    ? formatRelative(botStatus.lastSyncAt)
    : "—";

  return (
    <div className="mb-8 grid grid-cols-2 border-y border-border md:grid-cols-4">
      <Kpi n={entries.length} label="Total Classes" />
      <Kpi n={school} label="From School" accent="primary" />
      <Kpi n={personal} label="Personal" accent="personal" />
      <Kpi n={days} label="Days Active" sub={lastSync} />
    </div>
  );
}

function Kpi({
  n,
  label,
  accent,
  sub,
}: {
  n: number;
  label: string;
  accent?: "primary" | "personal";
  sub?: string;
}) {
  const colorClass =
    accent === "primary"
      ? "text-primary"
      : accent === "personal"
        ? "text-personal"
        : "text-foreground";
  return (
    <div className="border-r border-border px-4 py-5 last:border-r-0">
      <div className={`font-display text-4xl font-bold tabular-nums ${colorClass}`}>
        {String(n).padStart(2, "0")}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/70">
          · {sub}
        </div>
      )}
    </div>
  );
}

function BotStatusBadge({
  status,
  loading,
}: {
  status: ReturnType<typeof useRemoteTimetable>["botStatus"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <IconClock className="size-3 animate-pulse" /> checking bot
      </span>
    );
  }
  if (!status || !status.running) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-amber-500">
        <IconCircleX className="size-3" /> bot offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-500">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      bot live
    </span>
  );
}

function TelegramIngestCard() {
  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-card/60 paper-grain">
      <div className="rule-engraved flex items-start gap-3 px-5 pt-5">
        <div className="grid h-9 w-9 place-items-center border border-primary/40 bg-primary/10">
          <IconBrandTelegram className="size-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            Telegram bot · 6h auto-sync
          </h3>
          <p className="mt-1 font-serif text-xs italic text-muted-foreground">
            Forward messages from your school group to your bot. I scan every
            six hours — or on{" "}
            <code className="rounded-sm border border-border bg-muted px-1 font-mono text-[10px] not-italic">
              /sync
            </code>{" "}
            — extract the timetable, and write it to the register.
          </p>
        </div>
      </div>
      <ol className="m-0 ml-9 list-decimal space-y-2 px-5 pb-5 pt-3 font-mono text-[11px] text-muted-foreground">
        <li>
          Message{" "}
          <a
            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
          >
            @BotFather <IconArrowUpRight className="size-3" />
          </a>{" "}
          on Telegram → <code>/newbot</code> → copy the token.
        </li>
        <li>
          Save it as{" "}
          <code className="rounded-sm border border-border bg-muted px-1 text-[10px]">
            TELEGRAM_BOT_TOKEN
          </code>{" "}
          in{" "}
          <a
            className="text-primary underline-offset-2 hover:underline"
            href="/?t=settings&s=advanced"
          >
            Settings → Advanced → Secrets
          </a>
          .
        </li>
        <li>Open the bot and tap Start.</li>
        <li>Forward a school message. You're live.</li>
      </ol>
    </div>
  );
}

function AddTelegramHint() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-dashed border-border bg-card/30 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Need to add a class manually? Use the form on the right →
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
        zant · zo · 2026
      </div>
    </div>
  );
}

function Crosshairs() {
  return (
    <svg
      className="absolute inset-0 size-full opacity-[0.06]"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id="crosshatch"
          x="0"
          y="0"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#crosshatch)" />
    </svg>
  );
}

function Footer() {
  return (
    <footer className="mt-16 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <div>built on zo computer · register v1</div>
      <div>◢ zant · 2026</div>
    </footer>
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

function formatLong(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
