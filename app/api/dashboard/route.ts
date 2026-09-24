import { getDashboard } from "@/lib/price-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await getDashboard(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error("dashboard_failed", e instanceof Error ? e.message : "unknown"); return Response.json({ error: "价格资料暂时无法读取，请稍后重试。" }, { status: 503 }); }
}
