import { Bot, InputFile } from "grammy";
import { parseWhatsAppDump } from "./timetable-parser";
import {
  upsertEntries,
  entryCount,
  clearSource,
} from "./timetable-db";
import type { TimetableEntry } from "./timetable-types";
import { colorForSubject } from "./timetable-types";

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const HELP_TEXT = `Hi! I'm your timetable bot.

How this works:
• Forward any message from your school group(s) to me
• Every 6 hours I scan our chat, parse it, and update the timetable
• Forwarded messages can be plain text, or contain a CSV/JSON file

Commands:
/sync — parse all messages in our chat right now
/clear <source> — wipe school or personal entries
/status — show what's in the table
/help — this message`;

let _bot: Bot | null = null;
let _updateOffset = 0;
let _pollingTimer: ReturnType<typeof setTimeout> | null = null;
let _lastSyncAt: string | null = null;
let _lastSyncStats: { added: number; updated: number; messages: number } | null =
  null;

type StoredMessage = {
  update_id: number;
  chat_id: number;
  message_id: number;
  text: string;
  date: number;
};

let _bufferedMessages: StoredMessage[] = [];

function formatSyncStats(
  stats: { added: number; updated: number; messages: number } | null,
): string {
  if (!stats) return "No sync run yet.";
  const { added, updated, messages } = stats;
  return `Scanned ${messages} message${messages === 1 ? "" : "s"} · added ${added} · updated ${updated}`;
}

async function fetchNewMessages(bot: Bot): Promise<StoredMessage[]> {
  const updates = await bot.api.getUpdates({
    offset: _updateOffset,
    timeout: 0,
    allowed_updates: ["message"],
  });
  const messages: StoredMessage[] = [];
  for (const update of updates) {
    _updateOffset = update.update_id + 1;
    if (!update.message) continue;
    const msg = update.message;
    const text = msg.text ?? msg.caption ?? "";
    if (!text && !msg.document) continue;
    let resolvedText = text;
    if (msg.document) {
      try {
        const file = await bot.api.getFile(msg.document.file_id);
        const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
        const resp = await fetch(url);
        resolvedText = await resp.text();
      } catch (err) {
        console.error("[telegram-bot] failed to download document:", err);
      }
    }
    if (!resolvedText) continue;
    messages.push({
      update_id: update.update_id,
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: resolvedText,
      date: msg.date,
    });
  }
  return messages;
}

function parseAndStore(
  messages: StoredMessage[],
): { added: number; updated: number; parsed: TimetableEntry[]; messages: number } {
  const all: TimetableEntry[] = [];
  for (const m of messages) {
    const parsed = parseWhatsAppDump(m.text);
    for (const e of parsed) {
      e.color = e.color ?? colorForSubject(e.subject);
      e.id = `tg-${m.chat_id}-${m.message_id}-${all.length}`;
    }
    all.push(...parsed);
  }
  if (all.length === 0) {
    return { added: 0, updated: 0, parsed: [], messages: messages.length };
  }
  const { added, updated } = upsertEntries(all);
  return { added, updated, parsed: all, messages: messages.length };
}

async function syncCycle(bot: Bot, source: "scheduled" | "manual" = "scheduled") {
  try {
    const messages = await fetchNewMessages(bot);
    _bufferedMessages.push(...messages);
    if (_bufferedMessages.length === 0) {
      _lastSyncAt = new Date().toISOString();
      _lastSyncStats = { added: 0, updated: 0, messages: 0 };
      console.log("[telegram-bot] sync: no new messages");
      return;
    }
    const result = parseAndStore(_bufferedMessages);
    _bufferedMessages = [];
    _lastSyncAt = new Date().toISOString();
    _lastSyncStats = {
      added: result.added,
      updated: result.updated,
      messages: result.messages,
    };
    console.log(
      `[telegram-bot] sync (${source}): ${formatSyncStats(_lastSyncStats)}`,
    );
  } catch (err) {
    console.error("[telegram-bot] sync error:", err);
  }
}

function scheduleNext(bot: Bot) {
  if (_pollingTimer) clearTimeout(_pollingTimer);
  _pollingTimer = setTimeout(async () => {
    await syncCycle(bot, "scheduled");
    scheduleNext(bot);
  }, POLL_INTERVAL_MS);
}

export function startTelegramBot(): { ok: boolean; reason?: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn(
      "[telegram-bot] TELEGRAM_BOT_TOKEN not set — bot disabled. Add it in Settings → Advanced → Secrets.",
    );
    return { ok: false, reason: "missing-token" };
  }
  if (_bot) return { ok: true };

  const bot = new Bot(token);
  _bot = bot;

  bot.command("start", (ctx) => ctx.reply(HELP_TEXT));
  bot.command("help", (ctx) => ctx.reply(HELP_TEXT));

  bot.command("sync", async (ctx) => {
    await ctx.reply("Syncing now…");
    await syncCycle(bot, "manual");
    const total = entryCount("whatsapp");
    await ctx.reply(
      `Done. ${formatSyncStats(_lastSyncStats)}\nTotal school entries: ${total}`,
    );
  });

  bot.command("status", (ctx) => {
    const total = entryCount();
    const school = entryCount("whatsapp");
    const personal = entryCount("personal");
    const lastSync = _lastSyncAt
      ? new Date(_lastSyncAt).toISOString()
      : "never";
    ctx.reply(
      `Entries — total: ${total} · school: ${school} · personal: ${personal}\nLast sync: ${lastSync}\nNext sync: every 6 hours`,
    );
  });

  bot.command("clear", (ctx) => {
    const arg = ctx.match?.trim().toLowerCase();
    if (arg !== "school" && arg !== "personal") {
      return ctx.reply("Usage: /clear school  or  /clear personal");
    }
    const source = arg === "school" ? "whatsapp" : "personal";
    const n = clearSource(source as "whatsapp" | "personal");
    return ctx.reply(`Cleared ${n} ${arg} entries.`);
  });

  bot.on("message:text", (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    console.log(
      `[telegram-bot] buffered message ${ctx.message.message_id} from chat ${ctx.chat.id}`,
    );
  });

  // Start a single sync cycle, then schedule every 6h.
  syncCycle(bot, "manual").then(() => scheduleNext(bot));

  console.log(
    `[telegram-bot] started — polling every ${POLL_INTERVAL_MS / 1000 / 60 / 60}h`,
  );
  return { ok: true };
}

export function getBotStatus() {
  return {
    running: _bot !== null,
    lastSyncAt: _lastSyncAt,
    lastSyncStats: _lastSyncStats,
    nextSyncIn: _pollingTimer
      ? Math.max(0, POLL_INTERVAL_MS - 0)
      : null,
  };
}

export async function triggerSyncNow(): Promise<{
  added: number;
  updated: number;
  messages: number;
  lastSyncAt: string;
}> {
  if (!_bot) {
    throw new Error("Telegram bot not started (missing token?)");
  }
  await syncCycle(_bot, "manual");
  return {
    added: _lastSyncStats?.added ?? 0,
    updated: _lastSyncStats?.updated ?? 0,
    messages: _lastSyncStats?.messages ?? 0,
    lastSyncAt: _lastSyncAt ?? new Date().toISOString(),
  };
}
