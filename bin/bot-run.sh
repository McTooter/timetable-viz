#!/usr/bin/env bash
# Wrapper for the supervised bot process. Sources the platform secrets
# file (which auto-injects TELEGRAM_BOT_TOKEN) and execs the bot.

set -euo pipefail

SECRETS_FILE="/root/.zo_secrets"
if [ ! -r "$SECRETS_FILE" ]; then
  echo "[bot-run] FATAL: secrets file not readable: $SECRETS_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$SECRETS_FILE"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "[bot-run] FATAL: TELEGRAM_BOT_TOKEN not in secrets" >&2
  exit 1
fi

# Keep ZO_CLIENT_IDENTITY_TOKEN — the OCR path needs it to call the
# /zo/ask vision API. Other secrets stay in env but are not exported
# to the child explicitly (Bun inherits them).
export TELEGRAM_BOT_TOKEN
cd /home/workspace/timetable-viz
exec bun run src/bin/telegram-bot.ts
