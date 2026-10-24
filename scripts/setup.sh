#!/usr/bin/env bash
# Starts the stack and loads the credentials and workflows into n8n. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Copy .env.example to .env and fill it in first."; exit 1; }
set -a; source .env; set +a

docker compose up -d
echo "Waiting for n8n..."
until curl -sf http://localhost:5678/healthz >/dev/null; do sleep 2; done

# Credentials are written to a git-ignored folder, imported, then deleted.
mkdir -p .setup
node -e '
const e = process.env;
const creds = [
  { id: "bsPostgres01", name: "BrightSmile Postgres", type: "postgres",
    data: { host: "postgres", port: 5432, database: e.POSTGRES_DB, user: e.POSTGRES_USER, password: e.POSTGRES_PASSWORD, ssl: "disable" } },
  e.GROQ_API_KEY && { id: "bsGroq000001", name: "Groq", type: "groqApi", data: { apiKey: e.GROQ_API_KEY } },
  e.GOOGLE_CLIENT_ID && { id: "bsGoogleCal1", name: "Google Calendar", type: "googleCalendarOAuth2Api",
    data: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } },
  e.GOOGLE_CLIENT_ID && { id: "bsGmail00001", name: "Gmail", type: "gmailOAuth2",
    data: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } },
].filter(Boolean);
require("fs").writeFileSync(".setup/credentials.json", JSON.stringify(creds));
console.log("Credentials:", creds.map((c) => c.name).join(", "));
'
trap 'rm -rf .setup' EXIT

docker compose exec -T n8n n8n import:credentials --input=/project/.setup/credentials.json
docker compose exec -T n8n n8n import:workflow --separate --input=/project/workflows
# n8n only calls published workflows, so the tools are published along with the agent.
for id in BsToolSaveLead01 BsToolAvailab001 BsToolBookAppt01 BsToolHandoff001 BsLeadAgent00001; do
  docker compose exec -T n8n n8n publish:workflow --id=$id
done
docker compose restart n8n >/dev/null

cat <<EOF

Done.
  n8n editor:    http://localhost:5678
  Clinic site:   http://localhost:8080

Next, in the n8n editor:
  1. Open Credentials > "Google Calendar" and "Gmail" and click "Sign in with Google".
  2. Publish "Lead Agent · Follow-ups and reminders" to turn on reminder emails.
EOF
