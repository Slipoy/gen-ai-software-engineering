# ▶️ How to Run the Application

## Prerequisites

- **Node.js 20+** (developed and tested on Node 22) and npm
- `curl` for the sample script (preinstalled on macOS / most Linux distributions)

Check your versions:

```bash
node -v
npm -v
```

## Option 1: one command (recommended)

From the `homework-1` folder:

```bash
./demo/run.sh
```

The script installs dependencies (first run only), compiles TypeScript to `dist/` and starts the API on
**http://localhost:3000**, preloaded with the 10 demo transactions from `demo/sample-data.json`.

Expected output:

```
Seeded 10 transactions from demo/sample-data.json
Banking Transactions API listening on http://localhost:3000
```

Variations:

```bash
SEED_FILE= ./demo/run.sh   # start with an empty store
PORT=4000 ./demo/run.sh    # use another port
```

On Windows run the steps from Option 2 in PowerShell / Git Bash.

## Option 2: step by step

```bash
cd homework-1
npm install
npm run build
SEED_FILE=demo/sample-data.json npm start
```

For development with auto-reload on file changes:

```bash
npm run dev
```

## Verify it works

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

Then try the sample requests (with the server running, in a second terminal):

```bash
./demo/sample-requests.sh              # walkthrough of every endpoint
./demo/sample-requests.sh rate-limit   # 105 requests in a row -> HTTP 429
```

Or open `demo/sample-requests.http` in VS Code with the
[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension
(or in any JetBrains IDE) and click **Send Request** above each request.

## Run the tests

```bash
npm test          # 39 API tests (vitest + supertest)
npm run typecheck # strict TypeScript check
```

## Stop the server

Press `Ctrl+C` in the terminal where it runs. All data is in memory, so it is reset on every restart.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `EADDRINUSE: address already in use :::3000` | Another process uses port 3000. Stop it or run `PORT=4000 ./demo/run.sh` |
| `permission denied: ./demo/run.sh` | `chmod +x demo/*.sh` |
| `429 Too Many Requests` | You sent more than 100 requests in a minute; wait for the time in the `Retry-After` header |
