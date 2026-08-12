export function agentService(payTo, price, network) {
  return {
    type: "x402",
    id: "com.hydra.computer",
    name: "Computer",
    description:
      "Computer is a pay-per-screenshot API. Any AI agent sends a URL and gets a PNG at desktop, tablet, or mobile width. USDC on Base, x402 micropayment, verified on-chain.",
    price: price,
    currency: "USDC",
    network,
    chainId: network === "base-sepolia" ? 84532 : 8453,
    payTo,
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
