import express from "express";
import { parseProofHeader, verifyPayment } from "@rail402/x402";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PAYOUT_WALLET = process.env.PAYOUT_WALLET || "0x48B1F6C80db2386a53278C7b82B71a59D03aCF6F";
const PRICE = process.env.PRICE || "0.02";
const NETWORK = process.env.NETWORK || "base";

// Solana mainnet rail — free, no account: Dexter facilitator sponsors fees.
const SOLANA_PAYOUT_WALLET = process.env.SOLANA_PAYOUT_WALLET || "267VqNJSZS2Q9KRKF8tRYeZiwt62gLaG9MaTbQ2PyKGe";
const SOLANA_NETWORK_CAIP = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_FEE_PAYER = "DEXVS3su4dZQWTvvPnLDJLRK1CeeKG6K3QqdzthgAkNV";
const DEXTER_FACILITATOR = process.env.DEXTER_FACILITATOR || "https://x402.dexter.cash";

const USDC_DECIMALS = 6;
const CHAIN_ID = NETWORK === "base-sepolia" ? 84532 : 8453;
const USDC_ASSET = NETWORK === "base-sepolia"
  ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK_CAIP = `eip155:${CHAIN_ID}`;

function toAtomic(price) {
  const str = typeof price === "number" ? price.toFixed(USDC_DECIMALS) : String(price).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid price "${price}"`);
  const [whole, frac = ""] = str.split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
}
const AMOUNT_ATOMIC = toAtomic(PRICE);

function resourceUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${host}/api/screenshot`;
}

// v2 PaymentRequired object (specs/x402-specification-v2.md + extensions/bazaar.md)
function paymentRequiredV2(req, error) {
  return {
    x402Version: 2,
    error: error || "PAYMENT-SIGNATURE header is required",
    resource: {
      url: resourceUrl(req),
      description:
        "PagePeek: pay-per-screenshot API. Send any public URL and receive a PNG of the page at desktop, tablet, or mobile width. USDC on Base via x402 micropayment.",
      mimeType: "image/png",
      serviceName: "PagePeek",
      tags: ["screenshot", "image", "web", "url"],
    },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK_CAIP,
        amount: AMOUNT_ATOMIC,
        asset: USDC_ASSET,
        currency: USDC_ASSET,
        extra: { name: "USD Coin", version: "2" },
        maxTimeoutSeconds: 3600,
        payTo: PAYOUT_WALLET,
        recipient: PAYOUT_WALLET,
      },
      {
        scheme: "exact",
        network: SOLANA_NETWORK_CAIP,
        amount: AMOUNT_ATOMIC,
        asset: SOLANA_USDC_MINT,
        currency: SOLANA_USDC_MINT,
        extra: { name: "USD Coin", version: "2", feePayer: SOLANA_FEE_PAYER },
        maxTimeoutSeconds: 3600,
        payTo: SOLANA_PAYOUT_WALLET,
        recipient: SOLANA_PAYOUT_WALLET,
      },
    ],
    extensions: {
      bazaar: {
        info: {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            body: { url: "https://example.com", device: "desktop", full_page: false },
          },
          output: {
            type: "image/png",
            format: "binary",
            example: {
              description: "PNG screenshot bytes of the requested public URL.",
              url: "https://example.com",
              device: "desktop",
            },
          },
        },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            input: {
              type: "object",
              properties: {
                type: { type: "string", const: "http" },
                method: { type: "string", enum: ["POST", "PUT", "PATCH"] },
                bodyType: { type: "string", enum: ["json", "form-data", "text"] },
                body: {
                  type: "object",
                  properties: {
                    url: { type: "string", format: "uri", description: "Public URL to screenshot" },
                    device: { type: "string", enum: ["desktop", "tablet", "mobile"], default: "desktop" },
                    full_page: { type: "boolean", default: false },
                    wait_ms: { type: "number", default: 2500, minimum: 0, maximum: 30000 },
                  },
                  required: ["url"],
                },
              },
              required: ["type", "method", "bodyType", "body"],
              additionalProperties: false,
            },
            output: {
              type: "object",
              properties: {
                type: { type: "string" },
                example: { type: "object" },
              },
              required: ["type"],
            },
          },
          required: ["input"],
        },
      },
    },
  };
}

// Legacy v1 flat fields kept so v1 clients (rail402 fetchWithPayment, PayanAgent relay) still parse.
function legacyRequirements() {
  return {
    type: "x402_payment_required",
    amount: PRICE,
    amountAtomic: AMOUNT_ATOMIC,
    currency: "USDC",
    network: NETWORK,
    chainId: CHAIN_ID,
    payTo: PAYOUT_WALLET,
    resource: "/api/screenshot",
    description: "One screenshot of a public URL, PNG, at desktop/tablet/mobile width.",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

function sendPaymentRequired(req, res, error) {
  const v2 = paymentRequiredV2(req, error);
  const body = { ...legacyRequirements(), ...v2 };
  if (error) body.error = error;
  res.status(402);
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(v2)).toString("base64"));
  res.set("X-Payment-Required", "true");
  res.set("X-Payment-Network", NETWORK);
  res.set("X-Payment-Amount", AMOUNT_ATOMIC);
  res.set("X-Payment-Currency", "USDC");
  res.set("X-Payment-Address", PAYOUT_WALLET);
  return res.json(body);
}

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

async function capture({ url, device = "desktop", full_page = false, wait_ms = 2500 }) {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORTS[device] || VIEWPORTS.desktop,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(wait_ms);
    const shot = await page.screenshot({ type: "png", full_page });
    await context.close();
    return shot;
  } finally {
    await browser.close();
  }
}

app.get("/", (req, res) => {
  res.json({
    service: "PagePeek",
    description: "Pay-per-screenshot API. Send a URL, get a PNG of the page at desktop/tablet/mobile width.",
    protocol: "x402 v2 (HTTP 402 Payment Required)",
    price_usdc: PRICE,
    payout_wallet_evm: PAYOUT_WALLET,
    payout_wallet_solana: SOLANA_PAYOUT_WALLET,
    network: NETWORK,
    solana_network: SOLANA_NETWORK_CAIP,
    facilitator: DEXTER_FACILITATOR,
    usage: {
      method: "POST",
      path: "/api/screenshot",
      body: { url: "https://example.com", device: "desktop|tablet|mobile", full_page: false },
    },
    discovery: ["/.well-known/x402", "/.well-known/agent-services.json", "/llms.txt"],
  });
});

app.get("/.well-known/x402", (req, res) => {
  res.json({
    protocol: "x402",
    version: "2",
    endpoints: [
      {
        path: "/api/screenshot",
        method: "POST",
        price: PRICE,
        currency: "USDC",
        network: NETWORK,
        chainId: NETWORK === "base-sepolia" ? 84532 : 8453,
        payTo: PAYOUT_WALLET,
        description: "Take a screenshot of any URL at desktop/tablet/mobile widths. Returns PNG.",
      },
      {
        path: "/api/screenshot",
        method: "POST",
        price: PRICE,
        currency: "USDC",
        network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        payTo: SOLANA_PAYOUT_WALLET,
        facilitator: DEXTER_FACILITATOR,
        feePayer: SOLANA_FEE_PAYER,
        description: "Take a screenshot of any URL at desktop/tablet/mobile widths. Returns PNG.",
      },
    ],
  });
});

app.get("/.well-known/agent-services.json", async (req, res) => {
  res.json({ services: [await (await import("./well-known.js")).agentService(PAYOUT_WALLET, PRICE, NETWORK)] });
});

app.get("/llms.txt", (req, res) => {
  res.type("text/plain").send(
    [
      "# PagePeek (x402)",
      "",
      "Pay-per-request screenshot API for AI agents.",
      `- Endpoint: POST /api/screenshot`,
      `- Price: ${PRICE} USDC per screenshot`,
      `- Base (EVM): pay to ${PAYOUT_WALLET} (USDC)`,
      `- Solana mainnet: pay to ${SOLANA_PAYOUT_WALLET} via https://x402.dexter.cash (fee sponsored, USDC)`,
      "Protocol: HTTP 402 (x402 v2). Your agent's x402 client handles payment automatically.",
      "",
    ].join("\n")
  );
});

// Arena/Bazaar probe path: GET answers HTTP 402 with a v2 PaymentRequired body
// and PAYMENT-REQUIRED header so discovery crawlers can validate the endpoint.
app.get("/api/screenshot", (req, res) => {
  return sendPaymentRequired(req, res);
});

// Parse the x402 v2 PAYMENT-SIGNATURE header (raw JSON, or base64 of the JSON).
function parsePaymentSignature(value) {
  if (!value) return null;
  let text = Array.isArray(value) ? value[0] : value;
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(Buffer.from(text, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
}

// Expected PaymentRequirements for a settled request on the Solana rail.
function solanaPaymentRequirements() {
  return {
    scheme: "exact",
    network: SOLANA_NETWORK_CAIP,
    amount: AMOUNT_ATOMIC,
    asset: SOLANA_USDC_MINT,
    payTo: SOLANA_PAYOUT_WALLET,
    maxTimeoutSeconds: 3600,
    extra: { name: "USD Coin", version: "2", feePayer: SOLANA_FEE_PAYER },
  };
}

// Settle a Solana v2 payment through the Dexter facilitator (verify + submit).
// Client pre-builds the TransferChecked tx (fee sponsored by Dexter), we forward
// it, and only serve the screenshot once on-chain settlement confirms.
async function settleSolana(paymentPayload) {
  const body = {
    x402Version: 2,
    paymentPayload: JSON.parse(JSON.stringify(paymentPayload)),
    paymentRequirements: solanaPaymentRequirements(),
  };
  const resp = await fetch(`${DEXTER_FACILITATOR}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  if (!resp.ok && !(data && data.success)) {
    throw new Error(`dexter settle failed (${resp.status}): ${data ? JSON.stringify(data) : resp.statusText}`);
  }
  if (!data || data.success !== true) {
    throw new Error(`dexter settle rejected: ${JSON.stringify(data)}`);
  }
  return { transaction: data.transaction, payer: data.payer || paymentPayload.accepted?.payTo || null };
}

// x402 payment wall: returns 402 + v2 terms (with bazaar extension) until a
// valid payment proof is attached. Accepts the legacy v1 x-payment-proof
// (txHash) so @rail402/x402 clients and the PayanAgent relay keep working, and
// the v2 PAYMENT-SIGNATURE payload so Solana (Dexter) and v2 EVM rails settle.
app.post("/api/screenshot", async (req, res) => {
  // v2 path first: PAYMENT-SIGNATURE carries the full PaymentPayload.
  const paymentSignature = parsePaymentSignature(req.headers["payment-signature"]);
  if (paymentSignature) {
    const accepted = paymentSignature.accepted;
    let settleResult = null;
    try {
      if (accepted && accepted.network === SOLANA_NETWORK_CAIP) {
        settleResult = await settleSolana(paymentSignature);
      } else {
        // v2 EVM (eip155) not yet self-served on this rail — need CDP facilitator key.
        return sendPaymentRequired(req, res, "v2 EVM settlement requires CDP Facilitator (not configured)");
      }
    } catch (e) {
      return sendPaymentRequired(req, res, `settlement failed: ${e.message}`);
    }

    const { url, device = "desktop", full_page = false, wait_ms = 2500 } = req.body || {};
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: "url must start with http(s)://" });
    }
    try {
      const png = await capture({ url, device, full_page, wait_ms });
      res.set("Content-Type", "image/png");
      res.set("X-Paid-By", settleResult.payer || "");
      res.set("X-Settlement-Tx", settleResult.transaction || "");
      res.send(png);
    } catch (e) {
      res.status(502).json({ error: `screenshot failed: ${e.message}` });
    }
    return;
  }

  // Legacy v1 Base path: x-payment-proof txHash verified on-chain.
  const proof = parseProofHeader(req.headers["x-payment-proof"]);
  if (!proof) return sendPaymentRequired(req, res);
  const result = await verifyPayment(proof, {
    amountAtomic: AMOUNT_ATOMIC,
    payTo: PAYOUT_WALLET,
    network: NETWORK,
    minConfirmations: 1,
  });
  if (!result.valid) return sendPaymentRequired(req, res, result.error);

  const { url, device = "desktop", full_page = false, wait_ms = 2500 } = req.body || {};
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: "url must start with http(s)://" });
  }
  try {
    const png = await capture({ url, device, full_page, wait_ms });
    res.set("Content-Type", "image/png");
    res.set("X-Paid-By", result.payerWallet);
    res.send(png);
  } catch (e) {
    res.status(502).json({ error: `screenshot failed: ${e.message}` });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`x402 screenshot API listening on :${PORT}`);
  console.log(`Base payout ${PAYOUT_WALLET} | Solana payout ${SOLANA_PAYOUT_WALLET} | ${PRICE} USDC/screenshot`);
});
