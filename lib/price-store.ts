import { env } from "cloudflare:workers";
import { getProduct, getRegion, sourceFor, type Dashboard, type NormalizedPrice, type PriceRow, type SourceState } from "./catalog";
import { INITIAL_CHECKOUT_OBSERVATIONS } from "./checkout-observations";
import { extractApplePage, normalizePrices, convertAmount, checkoutNetAmount, estimateTaxExclusive } from "./pricing-core.mjs";
import { taxRateFor } from "./tax-rates.mjs";

export const FRESH_HOURS = 6;
const SOURCE_TTL = 30 * 60 * 1000;
const FX_URL = "https://open.er-api.com/v6/latest/USD";
const FX_SOURCE = "https://www.exchangerate-api.com";

type RecordRow = { key: string; product: string; region: string; payload: string | null; observed_at: number; attempted_at: number; retry_at: number; lease_until: number; status: string; error: string | null };
type CacheRow = { key: string; payload: string | null; updated_at: number; retry_at: number; lease_until: number };
type FxPayload = { rates: Record<string, number>; time_last_update_unix: number; time_next_update_unix: number };

function db(): D1Database {
  if (!env.DB) throw new Error("Price database unavailable");
  return env.DB;
}
function iso(n: number) { return n ? new Date(n).toISOString() : null; }
function sourceState(r: RecordRow): SourceState {
  const prices = readPrices(r);
  return { product: r.product, region: r.region, status: r.status, error: r.error,
    observedAt: iso(r.observed_at), attemptedAt: iso(r.attempted_at), retryAt: iso(r.retry_at),
    count: prices.length, sourceUrl: sourceFor(r.product, r.region) };
}
function readPrices(r: RecordRow): NormalizedPrice[] {
  if (!r.payload) return [];
  try { return JSON.parse(r.payload); } catch { return []; }
}
async function readSource(key: string) { return db().prepare("SELECT * FROM price_sources WHERE key = ?").bind(key).first<RecordRow>(); }

// Each source has a shared refresh lease and cooldown across visitors.
export async function refreshSource(product: string, region: string, force = false) {
  if (!getProduct(product) || !getRegion(region)) throw new Error("Invalid source");
  const key = `${product}:${region}`, now = Date.now(), lease = now + 45000;
  const cooldown = await db().prepare("SELECT MAX(retry_at) AS retry_at FROM price_sources WHERE status = 'rate_limited'").first<{ retry_at: number | null }>();
  if (cooldown?.retry_at && cooldown.retry_at > now) {
    const cached = await readSource(key);
    return cached ? sourceState(cached) : { product, region, status: "rate_limited", error: "官方来源正在冷却，请稍后重试", observedAt: null, attemptedAt: null, retryAt: iso(cooldown.retry_at), count: 0, sourceUrl: sourceFor(product, region) };
  }
  await db().prepare("INSERT OR IGNORE INTO price_sources (key, product, region) VALUES (?, ?, ?)").bind(key, product, region).run();
  const claim = await db().prepare(`UPDATE price_sources SET lease_until = ?, attempted_at = ?
    WHERE key = ? AND lease_until < ? AND retry_at <= ? AND attempted_at < ? AND observed_at < ?`)
    .bind(lease, now, key, now, now, now - 120000, force ? now : now - SOURCE_TTL).run();
  if (!claim.meta.changes) return sourceState((await readSource(key))!);
  const sourceUrl = sourceFor(product, region);
  let status = "error", error: string | null = null, retry = now + 300000;
  try {
    const response = await fetch(sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AIPricingObserver/1.0)",
      "Accept-Language": "en-US,en;q=0.8", "Accept": "text/html"
    } });
    if (response.status === 429) {
      status = "rate_limited";
      const value = response.headers.get("retry-after") || "";
      const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
      retry = now + Math.max(300000, Number.isFinite(delay) ? delay : 0);
      error = "官方来源暂时限流，冷却后可重试";
    } else if (response.status === 404) {
      status = "unavailable"; error = "该地区官方页面未上架"; retry = now + 6 * 3600000;
    } else if (!response.ok) {
      error = `官方来源暂不可用（HTTP ${response.status}）`;
    } else {
      const finalUrl = new URL(response.url);
      if (finalUrl.hostname !== "apps.apple.com" || !finalUrl.pathname.toLowerCase().startsWith(`/${region.toLowerCase()}/`)) {
        status = "unavailable"; error = "官方页面跳转到其他地区，未混用其价格"; retry = now + 6 * 3600000;
      } else {
        const page = extractApplePage(await response.text());
        if (!page.prices.length) { status = "no_prices"; error = "官方页面未公开内购价格"; retry = now + SOURCE_TTL; }
        else if (!page.currency) { error = "官方页面缺少币种，暂不参与比价"; }
        else {
          const observedAt = Date.now();
          const prices = normalizePrices(product, region, getRegion(region)!.name, page, sourceUrl, new Date(observedAt).toISOString());
          if (!prices.length) { status = "no_prices"; error = "该页面未公开订阅价格"; retry = now + SOURCE_TTL; }
          else {
            await db().prepare(`UPDATE price_sources SET payload = ?, observed_at = ?, status = 'ok', error = NULL, retry_at = 0, lease_until = 0 WHERE key = ? AND lease_until = ?`)
              .bind(JSON.stringify(prices), observedAt, key, lease).run();
            return sourceState((await readSource(key))!);
          }
        }
      }
    }
  } catch (e) {
    error = e instanceof Error && /timeout|abort/i.test(e.name + e.message) ? "官方来源响应超时，可稍后重试" : "暂时无法连接官方来源";
    console.warn("price_source_fetch_failed", { product, region, reason: e instanceof Error ? e.message.slice(0, 180) : "unknown" });
  }
  await db().prepare("UPDATE price_sources SET status = ?, error = ?, retry_at = ?, lease_until = 0 WHERE key = ? AND lease_until = ?")
    .bind(status, error, retry, key, lease).run();
  return sourceState((await readSource(key))!);
}

async function fxData() {
  const now = Date.now();
  await db().prepare("INSERT OR IGNORE INTO service_cache (key) VALUES ('fx_usd')").run();
  let record = await db().prepare("SELECT * FROM service_cache WHERE key = 'fx_usd'").first<CacheRow>();
  let failure: string | null = null;
  if (!record || record.retry_at <= now) {
    const lease = now + 25000;
    const claim = await db().prepare("UPDATE service_cache SET lease_until = ? WHERE key = 'fx_usd' AND lease_until < ? AND retry_at <= ?")
      .bind(lease, now, now).run();
    if (claim.meta.changes) {
      try {
        const response = await fetch(FX_URL, { cache: "no-store", signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`FX HTTP ${response.status}`);
        const data = await response.json() as FxPayload & { result: string; base_code: string };
        if (data.result !== "success" || data.base_code !== "USD" || !(data.rates?.USD === 1) || !(data.rates?.CNY > 0) || !(data.time_last_update_unix > 0)) throw new Error("Invalid FX payload");
        const payload: FxPayload = { rates: data.rates, time_last_update_unix: data.time_last_update_unix, time_next_update_unix: data.time_next_update_unix };
        const next = Math.max(now + 3600000, Math.min(now + 86400000, (data.time_next_update_unix || 0) * 1000));
        await db().prepare("UPDATE service_cache SET payload = ?, updated_at = ?, retry_at = ?, lease_until = 0 WHERE key = 'fx_usd' AND lease_until = ?")
          .bind(JSON.stringify(payload), now, next, lease).run();
      } catch (e) {
        failure = "汇率更新失败，显示最近一次可用汇率";
        console.warn("fx_fetch_failed", e instanceof Error ? e.message.slice(0, 180) : "unknown");
        await db().prepare("UPDATE service_cache SET retry_at = ?, lease_until = 0 WHERE key = 'fx_usd' AND lease_until = ?").bind(now + 3600000, lease).run();
      }
      record = await db().prepare("SELECT * FROM service_cache WHERE key = 'fx_usd'").first<CacheRow>();
    }
  }
  let payload: FxPayload | null = null;
  try { payload = record?.payload ? JSON.parse(record.payload) : null; } catch { /* unavailable */ }
  const stale = !payload || now - payload.time_last_update_unix * 1000 > 48 * 3600000;
  return { payload, summary: { available: !!payload, source: "ExchangeRate-API", sourceUrl: FX_SOURCE,
    date: payload ? new Date(payload.time_last_update_unix * 1000).toISOString() : null,
    fetchedAt: iso(record?.updated_at || 0), stale, usdToCny: payload?.rates.CNY ?? null,
    error: failure || (!payload ? "暂未取得参考汇率，换算与最低价排名暂停" : stale ? "参考汇率超过 48 小时，最低价排名暂停" : null) } };
}

export async function getDashboard(): Promise<Dashboard> {
  // Seed a small, explicit observation once; subsequent FX refreshes never renew
  // its record time or claim to have rechecked a checkout page.
  for (const quote of INITIAL_CHECKOUT_OBSERVATIONS) {
    await db().prepare("INSERT OR IGNORE INTO checkout_quotes (id, payload, recorded_at) VALUES (?, ?, ?)")
      .bind(quote.id, JSON.stringify(quote), new Date().toISOString()).run();
  }
  const [records, fx, checkouts] = await Promise.all([db().prepare("SELECT * FROM price_sources").all<RecordRow>(), fxData(),
    db().prepare("SELECT * FROM checkout_quotes").all<{id: string; payload: string; recorded_at: string}>()]);
  const now = Date.now();
  const rows = records.results.flatMap(record => readPrices(record).map(row => ({ ...row,
    channel: "ios" as const, taxBasis: "unknown" as const, listingAmount: row.amount,
    netAmount: null, taxAmount: null, checkoutTotal: null, sourceKind: "official_public" as const,
    evidenceNote: "App Store 公开内购标价；此数据源不提供本条目的税额明细，不当作网页税前价。",
    ...convertAmount(row.amount, row.currency, fx.payload?.rates),
    fresh: record.status === "ok" && now - record.observed_at <= FRESH_HOURS * 3600000 && !fx.summary.stale
  }))).map(row => ({...row, taxEstimate:estimateTaxExclusive(row, taxRateFor(row.region))}));
  const checkoutRows: PriceRow[] = checkouts.results.flatMap(record => {
    try {
      const quote = JSON.parse(record.payload);
      const amount = checkoutNetAmount(quote);
      return [{ ...quote, amount, displayPrice: `${quote.currency} ${amount ?? "待核实"}`,
        observedAt: record.recorded_at, ...convertAmount(amount, quote.currency, fx.payload?.rates),
        // Screenshot capture time is unknown. Preserve it as a dated reference;
        // it must never appear in an automatic current-lowest ranking.
        fresh: false,
      } as PriceRow];
    } catch { return []; }
  });
  const cooldown = Math.max(0, ...records.results.filter(r => r.status === "rate_limited").map(r => r.retry_at));
  return { rows, checkoutRows, sources: records.results.map(sourceState), fx: fx.summary, freshHours: FRESH_HOURS, generatedAt: new Date(now).toISOString(), sourceCooldownUntil: cooldown > now ? iso(cooldown) : null };
}

export async function refreshBatch(product: string, regions: string[], force: boolean) {
  const results: SourceState[] = [];
  let cursor = 0, paused = false;
  async function worker() {
    while (cursor < regions.length && !paused) {
      const region = regions[cursor++];
      const result = await refreshSource(product, region, force);
      results.push(result);
      if (result.status === "rate_limited") paused = true;
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, regions.length) }, worker));
  return results;
}
