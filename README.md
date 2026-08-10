# x402 Screenshot-as-a-Service

Pay-per-request screenshot API for AI agents. Any autonomous agent sends a URL, pays a USDC micropayment on **Base**, and gets a PNG back. Zero humans in the loop, zero KYC, money lands directly in the payout wallet.

## Protocol

Built on **x402** (`HTTP 402 Payment Required`) via the official `@rail402/x402` SDK:

1. Agent `POST /api/screenshot` → server replies `402` with payment terms.
2. Agent settles USDC on Base (~2s).
3. Agent retries with `X-Payment-Proof` → server verifies the transfer **directly against on-chain state** (no indexer, no custodian) → returns the PNG.

## Files

| File | Purpose |
|---|---|
| `server.js` | FastAPI-style Express service, x402-gated screenshot endpoint |
| `client-example.mjs` | Reference client: `fetchWithPayment` auto-pays and retries |
| `well-known.js` | `/.well-known/agent-services.json` marketplace discovery manifest |
| `Dockerfile` | Container with bundled Chromium |
| `package.json` | Deps: `@rail402/x402`, `express`, `playwright`, `viem` |

## Run locally

```bash
npm install
npx playwright install chromium
npm start          # http://localhost:8000
```

Verify the payment wall:

```bash
curl -X POST http://localhost:8000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
# → 402 x402_payment_required, amount 0.05 USDC, payTo 0x48B1...CF6F
```

## Paying client (any AI agent)

```bash
export AGENT_PRIVATE_KEY=0x...   # key holding USDC on Base
npm run client                   # saves paid-screenshot.png
```

`fetchWithPayment` handles the whole handshake: get 402 → settle → retry with proof.

## Payout wallet

```
0x48B1F6C80db2386a53278C7b82B71a59D03aCF6F  (Base)
```

All USDC paid by agents lands here. Verify on [Basescan](https://basescan.org/address/0x48B1F6C80db2386a53278C7b82B71a59D03aCF6F).

## Deploy

### Option A — Docker (VPS/Railway/Render/Fly)

```bash
docker build -t x402-screenshot .
docker run -p 8000:8000 -e PAYOUT_WALLET=0x48B1...CF6F -e PRICE=0.05 x402-screenshot
```

### Option B — Node host (native, no Docker)

```bash
npm install
npx playwright install chromium
PORT=8000 npm start
```

### Option C — Railway (recommended, Docker, stable URL)

This repo is already scaffolded for Railway:

- `Dockerfile` — `node:20-slim` + apt `chromium` + `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; no npm playwright-download step needed.
- `railway.toml` — Dockerfile builder, healthcheck `/`, restart-on-failure.

Deploy steps (≈10 min, human step — no token is stored on this machine):

1. Push this folder to a GitHub repo (any fresh public repo is fine):
   ```bash
   git add -A && git commit -m "x402 screenshot service"
   git remote add origin https://github.com/YOUR_USER/x402-screenshot-api.git
   git push -u origin main
   ```
2. Go to [Railway](https://railway.app) → New Project → Deploy from GitHub → pick that repo. Railway detects the Dockerfile automatically.
3. Add env vars on the service: `PAYOUT_WALLET=0x48B1F6C80Db2386a53278C7b82B71a59D03aCF6F`, `PRICE=0.01`, `NETWORK=base`.
4. Railway gives a permanent `https://<app>.up.railway.app` URL — save it.
5. Verify: `curl https://<app>.up.railway.app/api/screenshot` returns `402` with `PAYMENT-REQUIRED`.

That permanent URL is what gets listed in the registries (currently the trycloudflare quick-tunnel URL is temporary and rotates on restart).

## Marketplace listing (live today)

- **PayanAgent** (`payanagent.com`) — offer `kh7a9d7fk7beky2vj8sagf5nd18c7d1g`, $0.01/call, top-ranked, payments route to the payout wallet. Buy URL: `https://payanagent.com/x402/kh7a9d7fk7beky2vj8sagf5nd18c7d1g`.
- **Agent402 index** (`agent402.tools`) — origin listed, health 1, routable.
- **Rail402 marketplace** — dashboard + wallet connect (human step; do after stable URL).
- Registry credentials / offer IDs: see `REGISTRY_LEDGER.md` (kept out of git intentionally — it contains an API key).

## Economics

- Price: **$0.01 / screenshot** (configurable via `PRICE`), matching the market ($0.002–$0.03 is the going range on PayanAgent's catalog).
- 0% protocol fee; the SDK's verification is free and on-chain.
- Note: paid calls through the same wallet as `PAYOUT_WALLET` are self-transfers (no net USDC). Demand comes from *other* wallets buying the service.

## Honest status

- ✅ x402 protocol handshake verified live (402 challenge → terms → payTo wallet).
- ✅ PNG capture verified (Playwright + Chromium) and paid flow proven end-to-end over the public tunnel.
- ✅ Listed on PayanAgent + Agent402 index today.
- ⏳ Needs stable URL (Railway, above) to replace the rotating trycloudflare tunnel.
- ⏳ Until a *foreign* wallet pays, USDC balance won't move (self-tests only bump nonce).
