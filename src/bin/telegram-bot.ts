/**
 * Standalone Telegram bot process.
 *
 * Reads TELEGRAM_BOT_TOKEN from env, polls the bot's inbox every 6 hours,
 * parses forwarded messages into timetable entries, and writes them to the
 * shared SQLite DB. Writes a status JSON file (TIMETABLE_BOT_STATUS) so the
 * web site can show "last sync" without needing to talk to this process.
 *
 * Run as a supervised process on the Zo Computer:
 *   register_user_service({ label: "timetable-bot", mode: "process",
 *     entrypoint: "bun run /home/workspace/timetable-viz/src/bin/telegram-bot.ts" })
 */

import { Bot } from "grammy";
import { parseWhatsAppDump } from "../lib/timetable-parser";
import {
  upsertEntries,
  entryCount,
  clearSource,
} from "../lib/timetable-db";
import { colorForSubject } from "../lib/timetable-types";
import { writeFileSync } from "node:fs";

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STATUS_PATH =
  process.env.TIMETABLE_BOT_STATUS ??
  "/home/workspace/timetable-viz/.bot-status.json";

const HELP_TEXT = `Hi! I'm your timetable bot.

How this works:
• Forward any message from your school group(s) to me
• Every 6 hours I scan our chat, parse it, and update the timetable
• Forwarded messages can be plain text, or contain a CSV/JSON file

Commands:
/sync — parse all messages in our chat right now
/clear <school|personal> — wipe one side of the table
/status — show what's in the table
/help — this message`;

type StoredMessage = {
  update_id: number;
  chat_id: number;
  message_id: number;
  text: string;
  date: number;
};

let updateOffset = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncAt: string | null = null;
let lastSyncStats: { added: number; updated: number; messages: number } | null =
  null;
let bufferedMessages: StoredMessage[] = [];

function writeStatus() {
  try {
    const status = {
      running: true,
      lastSyncAt,
      lastSyncStats,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
  } catch (err) {
    console.error("[bot] failed to write status:", err);
  }
}

async function fetchNewMessages(bot: Bot): Promise<StoredMessage[]> {
  const updates = await bot.api.getUpdates({
    offset: updateOffset,
    timeout: 0,
    allowed_updates: ["message"],
  });
  const messages: StoredMessage[] = [];
  for (const update of updates) {
    updateOffset = update.update_id + 1;
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
        console.error("[bot] failed to download document:", err);
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

function parseAndStore(messages: StoredMessage[]) {
  const all: Array<{
    day: string;
    startTime: string;
    endTime: string;
    subject: string;
    location?: string;
    source: "whatsapp";
    id: string;
    color?: string;
  }> = [];
  for (const m of messages) {
    const parsed = parseWhatsAppDump(m.text);
    for (let i = 0; i < parsed.length; i++) {
      const e = parsed[i];
      all.push({
        ...e,
        id: `tg-${m.chat_id}-${m.message_id}-${i}`,
        color: e.color ?? colorForSubject(e.subject),
      });
    }
  }
  if (all.length === 0) {
    return { added: 0, updated: 0, messages: messages.length };
  }
  const { added, updated } = upsertEntries(all);
  return { added, updated, messages: messages.length };
}

async function syncCycle(bot: Bot, source: "scheduled" | "manual" = "scheduled") {
  try {
    const messages = await fetchNewMessages(bot);
    bufferedMessages.push(...messages);
    if (bufferedMessages.length === 0) {
      lastSyncAt = new Date().toISOString();
      lastSyncStats = { added: 0, updated: 0, messages: 0 };
      console.log(`[bot] sync (${source}): no new messages`);
      writeStatus();
      return;
    }
    const result = parseAndStore(bufferedMessages);
    bufferedMessages = [];
    lastSyncAt = new Date().toISOString();
    lastSyncStats = result;
    console.log(
      `[bot] sync (${source}): scanned ${result.messages} · added ${result.added} · updated ${result.updated}`,
    );
    writeStatus();
  } catch (err) {
    console.error("[bot] sync error:", err);
  }
}

function scheduleNext(bot: Bot) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    await syncCycle(bot, "scheduled");
    scheduleNext(bot);
  }, POLL_INTERVAL_MS);
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(
      "[bot] TELEGRAM_BOT_TOKEN is not set. Add it in Settings → Advanced → Secrets, then restart this service.",
    );
    process.exit(1);
  }

  const bot = new Bot(token);

  bot.command("start", (ctx) => ctx.reply(HELP_TEXT));
  bot.command("help", (ctx) => ctx.reply(HELP_TEXT));

  bot.command("sync", async (ctx) => {
    await ctx.reply("Syncing now…");
    await syncCycle(bot, "manual");
    const total = entryCount("whatsapp");
    const stats = lastSyncStats
      ? `Scanned ${lastSyncStats.messages} · added ${lastSyncStats.added} · updated ${lastSyncStats.updated}`
      : "No messages yet.";
    await ctx.reply(`Done. ${stats}\nTotal school entries: ${total}`);
  });

  bot.command("status", (ctx) => {
    const total = entryCount();
    const school = entryCount("whatsapp");
    const personal = entryCount("personal");
    const lastSync = lastSyncAt ? new Date(lastSyncAt).toISOString() : "never";
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
    const n = clearSource(source);
    return ctx.reply(`Cleared ${n} ${arg} entries.`);
  });

  bot.on("message:text", (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    console.log(
      `[bot] buffered message ${ctx.message.message_id} from chat ${ctx.chat.id}`,
    );
  });

  try {
    const me = await bot.api.getMe();
    console.log(`[bot] logged in as @${me.username} (id ${me.id})`);
  } catch (err) {
    console.error("[bot] failed to authenticate. Check TELEGRAM_BOT_TOKEN:", err);
    process.exit(1);
  }

  writeStatus();
  await syncCycle(bot, "manual");
  scheduleNext(bot);
  console.log(`[bot] polling every ${POLL_INTERVAL_MS / 1000 / 60 / 60}h`);

  setInterval(writeStatus, 60 * 1000);

  const shutdown = () => {
    console.log("[bot] shutting down");
    if (pollTimer) clearTimeout(pollTimer);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
