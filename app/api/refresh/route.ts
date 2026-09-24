import { getProduct, getRegion } from "@/lib/catalog";
import { getDashboard, refreshBatch } from "@/lib/price-store";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await request.json() as { product?: string; regions?: string[]; force?: boolean };
    if (!body.product || !getProduct(body.product) || !Array.isArray(body.regions) || !body.regions.length || body.regions.length > 20 || body.regions.some(r => typeof r !== "string" || !getRegion(r))) {
      return Response.json({ error: "请选择有效产品及 1–20 个国家或地区。" }, { status: 400 });
    }
    const regions = [...new Set(body.regions)];
    await refreshBatch(body.product, regions, body.force === true);
    return Response.json(await getDashboard(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("refresh_batch_failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "本次更新未完成，已取得的数据会保留，请稍后重试。" }, { status: 503 });
  }
}
