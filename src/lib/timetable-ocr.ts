import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ENDPOINT = "https://api.zo.computer/zo/ask";
const VISION_MODEL = "vercel:minimax/minimax-m3";
const IMAGE_DIR = process.env.TIMETABLE_BOT_IMAGE_DIR || "/home/workspace/timetable-viz/telegram-images";

if (!existsSync(IMAGE_DIR)) mkdirSync(IMAGE_DIR, { recursive: true });

const EXTRACTION_PROMPT = `You are a strict timetable OCR. The image shows a school weekly timetable.

Read every class entry. For each one, output one line:
  Day StartTime-EndTime Subject
Use 24h HH:MM. Days: Monday Tuesday Wednesday Thursday Friday Saturday Sunday.
Wrap output in a single \`\`\` code block.

If a cell is unclear, omit it. Do not invent. Output ONLY the code block, nothing else.`;

export type ImageInput = { url: string; mimeType?: string } | { path: string } | { base64: string; mimeType: string };

export async function imageToTimetableText(input: ImageInput): Promise<string> {
  // 1) Persist the image so the platform can see it. /zo/ask does not accept
  //    image payloads, so we hand it a file path on disk via the `files` field
  //    (or, as a last resort, attach it to a session we then read with this Zo).
  const dataUrl = await toDataUrl(input);
  if (!dataUrl) throw new Error("could not read image input");

  const filename = `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = guessExt(input) || "jpg";
  const localPath = join(IMAGE_DIR, `${filename}.${ext}`);
  const buf = dataUrlToBuf(dataUrl);
  writeFileSync(localPath, buf);

  // 2) Ask the platform to read the file and return parsed rows. The platform
  //    auto-loads files that are written under the workspace tree.
  const token = process.env.ZO_CLIENT_IDENTITY_TOKEN;
  if (!token) throw new Error("ZO_CLIENT_IDENTITY_TOKEN not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify({
      input: EXTRACTION_PROMPT + "\n\nImage file: " + localPath,
      model_name: VISION_MODEL,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    // cleanup best-effort
    try { unlinkSync(localPath); } catch {}
    throw new Error(`vision API ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = (await res.json()) as { output?: unknown };
  const text = typeof json.output === "string" ? json.output : "";
  // cleanup so we don't accumulate files
  try { unlinkSync(localPath); } catch {}
  return text;
}

function guessExt(input: ImageInput): string {
  if ("base64" in input) return input.mimeType.split("/")[1] || "jpg";
  if ("url" in input && input.mimeType) return input.mimeType.split("/")[1] || "jpg";
  return "jpg";
}

function dataUrlToBuf(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = dataUrl.slice(comma + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function toDataUrl(input: ImageInput): Promise<string | null> {
  if ("url" in input) {
    if (input.url.startsWith("data:")) return input.url;
    const r = await fetch(input.url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const mime = input.mimeType ?? r.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  }
  if ("path" in input) {
    if (!existsSync(input.path)) return null;
    const file = Bun.file(input.path);
    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  }
  if ("base64" in input) {
    return `data:${input.mimeType};base64,${input.base64}`;
  }
  return null;
}

export function parseExtractedRows(text: string): string[] {
  // Pull rows from any \`\`\` code block; fall back to any day-mentioning line.
  const lines: string[] = [];
  const blockRe = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  let collected = "";
  while ((m = blockRe.exec(text))) {
    collected += m[0] + "\n";
  }
  if (!collected) collected = text;
  for (const raw of collected.split(/\r?\n/)) {
    const line = raw.replace(/^```\w*\s*/, "").replace(/```\s*$/, "").trim();
    if (!line) continue;
    if (/^```/.test(line)) continue;
    if (/^day\b/i.test(line) && /subject|time/i.test(line)) continue;
    lines.push(line);
  }
  if (lines.length === 0) {
    const all = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(l) && /\d/.test(l));
    lines.push(...all);
  }
  return lines;
}
