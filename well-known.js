export function agentService(payTo, price, network) {
  return {
    type: "x402",
    id: "com.hydra.pagepeek",
    name: "PagePeek",
    description:
      "PagePeek is a pay-per-screenshot API. Any AI agent sends a URL and gets a PNG of the page at desktop, tablet, or mobile width. Pay in USDC on Base (EVM) or Solana mainnet via the Dexter x402 facilitator (fee sponsored).",
    price: price,
    currency: "USDC",
    network,
    chainId: network === "base-sepolia" ? 84532 : 8453,
    payTo,
    solanaPayTo: "267VqNJSZS2Q9KRKF8tRYeZiwt62gLaG9MaTbQ2PyKGe",
    solanaNetwork: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    facilitator: "https://x402.dexter.cash",
    endpoints: [
      {
        path: "/api/screenshot",
        method: "POST",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri", description: "Public URL to screenshot" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"], default: "desktop" },
            full_page: { type: "boolean", default: false },
            wait_ms: { type: "number", default: 2500, minimum: 0, maximum: 30000 },
          },
          required: ["url"],
        },
        outputSchema: { type: "string", format: "binary", contentType: "image/png" },
      },
    ],
  };
}
