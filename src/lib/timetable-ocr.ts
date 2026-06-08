/**
 * Vision-based timetable extraction. Sends an image to a vision-capable LLM
 * (the Zo /zo/ask API), asks it to read the table, and returns parseable
 * text lines that the WhatsApp-style parser can consume.
 */

import { existsSync } from "node:fs";

const ENDPOINT = "https://api.zo.computer/zo/ask";
const VISION_MODEL = "vercel:minimax/minimax-m3";

const EXTRACTION_PROMPT = `You are a strict timetable OCR. The image shows a school weekly timetable (table, list, or free-form text).

Read every class entry. For each one, output one line:
  Day StartTime-EndTime Subject
Use 24h HH:MM. Days: Monday Tuesday Wednesday Thursday Friday Saturday Sunday.

If a cell is unclear, omit it. Do not invent. Output ONLY the lines, nothing else.`;

type ImageInput = { url: string; mimeType?: string } | { path: string } | { base64: string; mimeType: string };

export async function imageToTimetableText(input: ImageInput): Promise<string> {
  const token = process.env.ZO_CLIENT_IDENTITY_TOKEN;
  if (!token) {
    throw new Error("ZO_CLIENT_IDENTITY_TOKEN is not set in env (should be auto-injected)");
  }

  const dataUrl = await toDataUrl(input);
  if (!dataUrl) {
    throw new Error("could not read image input");
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: token,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: [
        { type: "text", text: EXTRACTION_PROMPT },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
      model_name: VISION_MODEL,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`vision API ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = (await res.json()) as { output?: unknown };
  const text = typeof json.output === "string" ? json.output : "";
  return text;
}

async function toDataUrl(input: ImageInput): Promise<string | null> {
  if ("url" in input) {
    if (input.url.startsWith("data:")) return input.url;
    const r = await fetch(input.url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const mime = input.mimeType ?? r.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${btoa(String.fromCharCode(...buf))}`;
  }
  if ("path" in input) {
    if (!existsSync(input.path)) return null;
    const file = Bun.file(input.path);
    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    return `data:${mime};base64,${btoa(String.fromCharCode(...buf))}`;
  }
  if ("base64" in input) {
    return `data:${input.mimeType};base64,${input.base64}`;
  }
  return null;
}

export function parseExtractedRows(text: string): string[] {
  const lines: string[] = [];
  let inCode = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (!inCode) continue;
    if (!line) continue;
    if (/^day\b/i.test(line) && /subject|time/i.test(line)) continue;
    lines.push(line);
  }
  if (lines.length === 0) {
    const all = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(l) && /\d/.test(l));
    lines.push(...all);
  }
  return lines;
}
