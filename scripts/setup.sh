#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo '.env already exists; kept unchanged.'; exit 0; fi
node -e 'const fs=require("fs"),c=require("crypto");fs.writeFileSync(".env",fs.readFileSync(".env.example","utf8").replace("replace-with-generated-hex",c.randomBytes(32).toString("hex")).replace("replace-with-generated-token-at-least-24-characters",c.randomBytes(32).toString("hex")),{mode:0o600})'
echo '.env created. Set JOB_WATCHER_BASE_URL, then run docker compose up -d --build'
