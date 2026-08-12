import express from "express";
import { withX402, createPaymentRequirements, requirementHeaders } from "@rail402/x402";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PAYOUT_WALLET = process.env.PAYOUT_WALLET || "0x48B1F6C80db2386a53278C7b82B71a59D03aCF6F";
const PRICE = process.env.PRICE || "0.015";
const NETWORK = process.env.NETWORK || "base";

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
    protocol: "x402 (HTTP 402 Payment Required)",
    price_usdc: PRICE,
    payout_wallet: PAYOUT_WALLET,
    network: NETWORK,
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
      `- Price: ${PRICE} USDC (Base)`,
      `- Pay to: ${PAYOUT_WALLET}`,
      "Protocol: HTTP 402 (x402). Your agent's x402 client handles payment automatically.",
      "",
    ].join("\n")
  );
});

// Arena/Bazaar probe path: GET answers HTTP 402 with payment headers so
// discovery crawlers (x402 array verification) can validate the endpoint.
app.get("/api/screenshot", (req, res) => {
  const terms = createPaymentRequirements({ price: PRICE, wallet: PAYOUT_WALLET, network: NETWORK, description: "One screenshot of a public URL, PNG.", resource: "/api/screenshot" });
  res.set(requirementHeaders(terms));
  res.set("PAYMENT-REQUIRED", "true");
  res.status(402).json(terms);
});

// x402 payment wall: returns 402 + terms until a valid USDC proof is attached.
app.post(
  "/api/screenshot",
  withX402(
    async (req, res) => {
      const { url, device = "desktop", full_page = false, wait_ms = 2500 } = req.body || {};
      if (!url || !/^https?:\/\//.test(url)) {
        return res.status(400).json({ error: "url must start with http(s)://" });
      }
      try {
        const png = await capture({ url, device, full_page, wait_ms });
        res.set("Content-Type", "image/png");
        res.set("X-Paid-By", req.x402.payerWallet);
        res.send(png);
      } catch (e) {
        res.status(502).json({ error: `screenshot failed: ${e.message}` });
      }
    },
    {
      price: PRICE,
      wallet: PAYOUT_WALLET,
      network: NETWORK,
      description: "One screenshot of a public URL, PNG, at desktop/tablet/mobile width.",
      resource: "/api/screenshot",
    }
  )
);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`x402 screenshot API listening on :${PORT}`);
  console.log(`Payout wallet ${PAYOUT_WALLET} | ${PRICE} USDC/screenshot on ${NETWORK}`);
});
