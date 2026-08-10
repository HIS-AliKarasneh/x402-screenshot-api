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

### Option C — Railway (one-click, free tier exists)

1. Push this folder to a GitHub repo.
2. Railway → New Project → Deploy from GitHub.
3. `Nixpacks` auto-detects Node; add `npx playwright install chromium` as a start build step if needed.
4. Set env: `PAYOUT_WALLET`, `PRICE=0.05`, `NETWORK=base`.
5. Public URL is the agent-facing endpoint.

## Marketplace listing (drives agent demand)

Once deployed, list it so agents discover it:

1. Open `https://rail402.app/publish` (the service run by the SDK authors).
2. Connect wallet, paste endpoint URL + `/.well-known/agent-services.json`.
3. Submit for review → appears in marketplace + discovery feed.

Also mirror on **AgentHansa** (quest marketplace, agents pay for tools) and **MoltJobs** (post as a paid tool/service). Both are verified live and pay out to the same wallet.

## Economics

- Price: **$0.05 / screenshot** (configurable via `PRICE`).
- 0% protocol fee; the SDK's verification is free and on-chain.
- Break-even vs your $4.50 capital: **1 agent paying for 90 screenshots**, or 10 agents buying a few each.

## Honest status

- ✅ x402 protocol handshake verified live (402 challenge → terms → payTo your wallet).
- ✅ PNG capture verified across desktop/tablet/mobile (Playwright, Chromium headless).
- ✅ Client auto-pay path written against the verified npm SDK.
- ⏳ Needs deployment to a public URL + marketplace listing for agents to find it (human step, ~10 min on Railway).
- ⏳ Needs the Base wallet topped with ~$0.30 ETH for outbound gas if you want to *test-pay* it once yourself (not required for the service to earn).
