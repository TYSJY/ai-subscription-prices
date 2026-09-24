import regions from "./regions.json";

export const REGIONS = regions;
export const PRODUCTS = [
  { id: "chatgpt", name: "ChatGPT", maker: "OpenAI", appId: "6448311069", slug: "chatgpt", mark: "G" },
  { id: "claude", name: "Claude", maker: "Anthropic", appId: "6473753684", slug: "claude-by-anthropic", mark: "C" },
  { id: "gemini", name: "Gemini", maker: "Google", appId: "6477489729", slug: "google-gemini", mark: "✦" },
  { id: "grok", name: "Grok", maker: "xAI", appId: "6670324846", slug: "grok-ai", mark: "X" },
];
export const getProduct = (id: string) => PRODUCTS.find((p) => p.id === id);
export const getRegion = (code: string) => REGIONS.find((r) => r.code === code.toUpperCase());
export const sourceFor = (product: string, region: string) => {
  const p = getProduct(product);
  if (!p || !getRegion(region)) throw new Error("Invalid product or region");
  return `https://apps.apple.com/${region.toLowerCase()}/app/${p.slug}/id${p.appId}`;
};

export type NormalizedPrice = {
  id: string; product: string; region: string; regionName: string;
  name: string; planId: string; planName: string; currency: string;
  amount: number | null; displayPrice: string; cycle: "month" | "year" | "unknown";
  ambiguous: boolean; variant: number; sourceUrl: string; observedAt: string;
};
export type PriceRow = NormalizedPrice & {
  usd: number | null; cny: number | null; fresh: boolean;
  channel: "ios" | "web";
  taxBasis: "unknown" | "exclusive";
  listingAmount: number | null;
  netAmount: number | null;
  taxAmount: number | null;
  checkoutTotal: number | null;
  sourceKind: "official_public" | "user_checkout";
  evidenceNote: string;
  reportedDate?: string;
  taxEstimate?: {
    percent:number | null; label:string; sourceUrl:string | null; sourceName:string | null;
    reviewedAt:string | null; note:string; method:string;
    amount:number | null; usd:number | null; cny:number | null; taxAmount:number | null;
  };
};
export type SourceState = {
  product: string; region: string; status: string; error: string | null;
  observedAt: string | null; attemptedAt: string | null; retryAt: string | null;
  count: number; sourceUrl: string;
};
export type Dashboard = {
  rows: PriceRow[]; checkoutRows: PriceRow[]; sources: SourceState[];
  fx: { available: boolean; source: string; sourceUrl: string; date: string | null; fetchedAt: string | null; stale: boolean; usdToCny: number | null; error: string | null };
  generatedAt: string; freshHours: number;
  sourceCooldownUntil: string | null;
};
