# sheets-mcp

An MCP server that lets Claude read and write Google Sheets. Connect it to Claude.ai and work with any spreadsheet directly — no CSV exports needed.

## Tools

| Tool | Description |
|---|---|
| `get_spreadsheet_info` | Returns title and worksheet metadata |
| `list_sheets` | Lists all worksheet tab names |
| `read_sheet` | Reads a range of cells (A1 notation) |
| `update_sheet` | Writes values to a range of cells |

## Setup

### 1. Google Cloud — service account + Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project
2. Search for **Google Sheets API** and enable it
3. Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Name it anything (e.g. `sheets-mcp`)
   - Skip role assignment, click Done
4. Click the service account → **Keys tab → Add Key → Create new key → JSON**
   - Download the `.json` file — treat it like a password
5. Note the `client_email` in the JSON (e.g. `sheets-mcp@your-project.iam.gserviceaccount.com`)

### 2. Share your spreadsheets

For each spreadsheet you want Claude to access, share it with the service account email (just like sharing with a person). Give it **Viewer** access for read-only, or **Editor** access if you want Claude to be able to update cells.

### 3. Deploy

#### Option A — Railway (recommended)

1. Go to [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo** → select your fork of this repo
2. Set these environment variables in Railway (Variables tab):
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — paste the entire contents of your service account JSON key as a single line
   - `MCP_API_KEY` — a long random string (e.g. `openssl rand -hex 32`); this protects your server
3. Railway gives you a public HTTPS URL — note it for the next step

#### Option B — Run locally with a tunnel

```bash
npm install
npm run build
cp .env.example .env
# edit .env: set GOOGLE_APPLICATION_CREDENTIALS to your key file path
npm start
# in another terminal:
npx cloudflared tunnel --url http://localhost:3000
# use the *.trycloudflare.com URL in Claude.ai
```

#### Option C — Any Node.js host (Fly, Render, VPS)

Set `GOOGLE_SERVICE_ACCOUNT_JSON` and `MCP_API_KEY` as environment variables, then:

```bash
npm install && npm run build && npm start
```

The server listens on `PORT` (default `3000`) and exposes `/mcp` and `/health`.

### 4. Connect to Claude.ai

1. Go to **Claude.ai → Settings → Integrations → Add Integration**
2. Enter your server URL: `https://your-deployment.railway.app/mcp`
3. If you set `MCP_API_KEY`, add it as a Bearer token in the Authorization field

Claude can now read and write any spreadsheet you've shared with the service account email.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | One of these two | Entire service account JSON key as a single line |
| `GOOGLE_APPLICATION_CREDENTIALS` | One of these two | Path to the service account JSON key file |
| `MCP_API_KEY` | Recommended | Bearer token clients must send; omit to disable auth |
| `PORT` | No | Port to listen on (default: `3000`) |

## Local development

```bash
npm install
npm run build
cp .env.example .env   # fill in your credentials
npm start              # server on http://localhost:3000
```

Test with the MCP Inspector:
```bash
npx @modelcontextprotocol/inspector
# Connect to: http://localhost:3000/mcp
```

## Example usage in Claude

> "Read my job search spreadsheet `1abc...xyz` and summarize which companies haven't responded yet."

> "In spreadsheet `1abc...xyz`, update cell F5 to 'Yes' and G5 to today's date."

> "List all the sheets in spreadsheet `1abc...xyz`."
