import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { fetchWithPayment } from "@rail402/x402";

// The agent's payer wallet — holds the USDC that pays the screenshot service.
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
if (!AGENT_PRIVATE_KEY) {
  console.error("Set AGENT_PRIVATE_KEY to an EVM private key that holds USDC on Base.");
  process.exit(1);
}

const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
const wallet = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

const API_URL = process.env.API_URL || "http://localhost:8000";

// fetchWithPayment: first call gets 402 + terms, it settles USDC on-chain,
// retries with X-Payment-Proof, and returns the final response.
const res = await fetchWithPayment(
  `${API_URL}/api/screenshot`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://hydra-it.com",
      device: "desktop",
      full_page: false,
    }),
  },
  wallet
);

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const fs = await import("node:fs");
fs.writeFileSync("paid-screenshot.png", buf);
console.log(`Paid screenshot saved: paid-screenshot.png (${buf.length} bytes)`);
