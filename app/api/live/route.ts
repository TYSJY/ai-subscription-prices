import { getProduct, getRegion } from "@/lib/catalog";
import { getDashboard, refreshSource } from "@/lib/price-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const product = params.get("product") || "chatgpt", region = (params.get("region") || "US").toUpperCase();
  if (!getProduct(product) || !getRegion(region)) return Response.json({ error: "产品或地区无效。" }, { status: 400 });
  try {
    const source = await refreshSource(product, region, true);
    const dashboard = await getDashboard();
    const prices = dashboard.rows.filter(row => row.product === product && row.region === region);
    if (source.status !== "ok") return Response.json({ ...source, error: source.error || "该地区暂未取得有效价格。" }, { status: source.status === "rate_limited" ? 429 : source.status === "unavailable" ? 404 : 502 });
    return Response.json({ ...source, prices, fx: dashboard.fx }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("live_failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "查询服务暂不可用，请稍后重试。" }, { status: 503 });
  }
}
