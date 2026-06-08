import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";
import {
  parseWhatsAppDump,
  parseCSV,
  parseJSONTimetable,
  sortEntries,
} from "./src/lib/timetable-parser";
import {
  getAllEntries,
  upsertEntries,
  removeEntry,
  entryCount,
  clearSource,
} from "./src/lib/timetable-db";
import { colorForSubject } from "./src/lib/timetable-types";
import type { TimetableSource } from "./src/lib/timetable-types";

// AI agents: read README.md for navigation and contribution guidance.
type Mode = "development" | "production";
const app = new Hono();

const mode: Mode =
  process.env.NODE_ENV === "production" ? "production" : "development";

/**
 * API routes
 */
app.get("/api/hello-zo", (c) => c.json({ msg: "Hello from Zo" }));

app.get("/api/entries", (c) => {
  return c.json({ entries: getAllEntries() });
});

app.post("/api/entries", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | {
        entries?: Array<{
          day: string;
          startTime: string;
          endTime: string;
          subject: string;
          location?: string;
          source?: TimetableSource;
          id?: string;
        }>;
        text?: string;
        format?: "whatsapp" | "csv" | "json";
        source?: TimetableSource;
      }
    | null;
  if (!body) return c.json({ error: "invalid body" }, 400);

  let entries: Array<{
    day: string;
    startTime: string;
    endTime: string;
    subject: string;
    location?: string;
    source: TimetableSource;
    id?: string;
    color?: string;
  }> = [];

  if (body.entries && Array.isArray(body.entries)) {
    entries = body.entries.map((e) => ({
      ...e,
      source: (e.source ?? body.source ?? "whatsapp") as TimetableSource,
    }));
  } else if (body.text) {
    const fmt = body.format ?? "whatsapp";
    const parsed =
      fmt === "csv"
        ? parseCSV(body.text)
        : fmt === "json"
          ? parseJSONTimetable(body.text)
          : parseWhatsAppDump(body.text);
    entries = sortEntries(parsed).map((e) => ({
      ...e,
      source: (e.source ?? body.source ?? "whatsapp") as TimetableSource,
    }));
  } else {
    return c.json({ error: "no entries or text provided" }, 400);
  }

  for (const e of entries) {
    e.color = e.color ?? colorForSubject(e.subject);
  }
  const result = upsertEntries(entries as never);
  return c.json({
    added: result.added,
    updated: result.updated,
    total: entryCount(),
  });
});

app.delete("/api/entries/:id", (c) => {
  const id = c.req.param("id");
  const ok = removeEntry(id);
  return c.json({ ok });
});

app.delete("/api/entries", (c) => {
  const source = c.req.query("source") as TimetableSource | undefined;
  if (!source || (source !== "whatsapp" && source !== "personal")) {
    return c.json({ error: "source must be 'whatsapp' or 'personal'" }, 400);
  }
  const n = clearSource(source);
  return c.json({ removed: n });
});

/**
 * Bot status — reports the standalone bot service's health, sourced from
 * a small status file the bot process writes to. If the file is missing
 * or stale, the bot is considered offline.
 */
app.get("/api/bot/status", async (c) => {
  const statusFile =
    process.env.TIMETABLE_BOT_STATUS_PATH ??
    "/home/workspace/timetable-viz/.bot-status.json";
  try {
    const file = Bun.file(statusFile);
    if (!(await file.exists())) {
      return c.json({ running: false, lastSyncAt: null, lastSyncStats: null, nextSyncIn: null });
    }
    const status = (await file.json()) as {
      running: boolean;
      lastSyncAt: string | null;
      lastSyncStats: { added: number; updated: number; messages: number } | null;
    };
    return c.json(status);
  } catch {
    return c.json({ running: false, lastSyncAt: null, lastSyncStats: null, nextSyncIn: null });
  }
});

if (mode === "production") {
  configureProduction(app);
} else {
  await configureDevelopment(app);
}

const port = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : mode === "production"
    ? (config.publish?.published_port ?? config.local_port)
    : config.local_port;

export default { fetch: app.fetch, port, idleTimeout: 255 };

function configureProduction(app: Hono) {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 302));
  app.use(async (c, next) => {
    if (c.req.method !== "GET") return next();

    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/assets/")) return next();

    const file = Bun.file(`./dist${path}`);
    if (await file.exists()) {
      const stat = await file.stat();
      if (stat && !stat.isDirectory()) {
        return new Response(file);
      }
    }

    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

async function configureDevelopment(app: Hono): Promise<ViteDevServer> {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    if (c.req.path === "/favicon.ico") return c.redirect("/favicon.svg", 302);

    const url = c.req.path;
    try {
      if (url === "/" || url === "/index.html") {
        let template = await Bun.file("./index.html").text();
        template = await vite.transformIndexHtml(url, template);
        return c.html(template, {
          headers: { "Cache-Control": "no-store, must-revalidate" },
        });
      }

      const publicFile = Bun.file(`./public${url}`);
      if (await publicFile.exists()) {
        const stat = await publicFile.stat();
        if (stat && !stat.isDirectory()) {
          return new Response(publicFile, {
            headers: { "Cache-Control": "no-store, must-revalidate" },
          });
        }
      }

      let result;
      try {
        result = await vite.transformRequest(url);
      } catch {
        result = null;
      }

      if (result) {
        return new Response(result.code, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-store, must-revalidate",
          },
        });
      }

      let template = await Bun.file("./index.html").text();
      template = await vite.transformIndexHtml("/", template);
      return c.html(template, {
        headers: { "Cache-Control": "no-store, must-revalidate" },
      });
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      return c.text("Internal Server Error", 500);
    }
  });

  return vite;
}
