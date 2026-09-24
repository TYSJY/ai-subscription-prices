"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, CircleHelp, Clock3, Globe2, LayoutDashboard, Loader2, RefreshCw, Search, Square, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRODUCTS, REGIONS, sourceFor, type Dashboard, type PriceRow } from "@/lib/catalog";
import { rankRows, comparisonRows } from "@/lib/pricing-core.mjs";
import { serviceUrl } from "@/lib/site-info";
import { TAX_RATES, TAX_REVIEWED_AT } from "@/lib/tax-rates.mjs";

const DEFAULT_PLAN: Record<string, string> = { chatgpt: "chatgpt:plus:unknown:1", claude: "claude:claude-pro-monthly:month:1", gemini: "gemini:google-ai-pro-5-tb:unknown:1", grok: "grok:supergrok:unknown:1" };
const FEATURED = [
  { product: "chatgpt", id: DEFAULT_PLAN.chatgpt, label: "ChatGPT Plus", hint: "PLUS" },
  { product: "chatgpt", id: "chatgpt:pro-5x:unknown:1", label: "ChatGPT Pro 5x", hint: "PRO / 5×" },
  { product: "chatgpt", id: "chatgpt:pro-20x:unknown:1", label: "ChatGPT Pro 20x", hint: "PRO / 20×" },
  { product: "claude", id: DEFAULT_PLAN.claude, label: "Claude Pro", hint: "MONTHLY" },
  { product: "gemini", id: DEFAULT_PLAN.gemini, label: "Google AI Pro · 5 TB", hint: "GEMINI" },
  { product: "grok", id: DEFAULT_PLAN.grok, label: "SuperGrok", hint: "GROK" },
];
const viewPlan = (id: string, channel: string) => channel === "web" ? id.replace(":unknown:", ":month:") : id;
const money = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (s: string | null | undefined) => s ? new Date(s).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "尚未更新";
const cycle = (r?: PriceRow) => r?.cycle === "month" ? "月付" : r?.cycle === "year" ? "年付" : "周期未标注";
const flag = (code: string) => String.fromCodePoint(...code.toUpperCase().split("").map(c => c.charCodeAt(0) + 127397));
const errorMessage = (e: unknown) => e instanceof Error ? e.message : "暂时无法读取，请稍后重试。";

async function readResponse(response: Response): Promise<Dashboard> {
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("服务暂时不可用，请稍后重试。");
  const data = await response.json() as Dashboard & { error?: string };
  if (!response.ok) throw new Error(data.error || "更新失败，请稍后重试。");
  if (!Array.isArray(data.rows) || !Array.isArray(data.sources)) throw new Error("价格资料格式不完整，请重试。");
  return data;
}

type Progress = { done: number; total: number; product: string; label: string };
type DisplayRow = PriceRow & { originalUsd:number | null; originalCny:number | null };
const TAX_COVERAGE = REGIONS.filter(r => Number.isFinite(TAX_RATES[r.code]?.percent)).length;
export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [channel, setChannel] = useState<"web" | "ios">("ios");
  const channelRef = useRef<"web" | "ios">("ios");
  const [basis, setBasis] = useState<"net" | "gross">("net");
  const [product, setProduct] = useState("chatgpt"), [plan, setPlan] = useState(DEFAULT_PLAN.chatgpt);
  const [query, setQuery] = useState(""), [sort, setSort] = useState("cny");
  const [auto, setAuto] = useState(true), [progress, setProgress] = useState<Progress | null>(null);
  const [notice, setNotice] = useState("");
  const dataRef = useRef<Dashboard | null>(null), working = useRef(false), stop = useRef(false), mounted = useRef(true);
  function accept(next: Dashboard) { dataRef.current = next; if (mounted.current) setData(next); }

  async function refreshReference() {
    setError("");
    try {
      accept(await readResponse(await fetch("/api/dashboard", { cache: "no-store", signal: AbortSignal.timeout(25000) })));
      setNotice("已读取最新可用汇率；结算截图的价格和记录日期没有变化。");
    } catch (e) { setError(errorMessage(e)); }
  }
  function changeChannel(value: "web" | "ios") {
    stop.current = true; channelRef.current = value; setChannel(value); setQuery(""); setNotice("");
    setPlan(value === "web" && product === "chatgpt" ? "chatgpt:pro-5x:month:1" : viewPlan(DEFAULT_PLAN[product], value));
  }
  async function updateProducts(ids: string[], force: boolean, onlyRegions?: string[]) {
    if (channelRef.current === "web") { await refreshReference(); return; }
    if (working.current) return;
    if (dataRef.current?.sourceCooldownUntil && Date.parse(dataRef.current.sourceCooldownUntil) > Date.now()) {
      setNotice(`官方来源正在冷却，${time(dataRef.current.sourceCooldownUntil)} 后可重试。`); return;
    }
    working.current = true; stop.current = false; setError(""); setNotice("");
    const now = Date.now();
    const jobs = ids.map(id => ({ product: id, regions: REGIONS.filter(r => {
      if (onlyRegions && !onlyRegions.includes(r.code)) return false;
      const source = dataRef.current?.sources.find(s => s.product === id && s.region === r.code);
      if (source?.retryAt && Date.parse(source.retryAt) > now) return false;
      if (source?.attemptedAt && now - Date.parse(source.attemptedAt) < 120000) return false;
      return force || !source?.observedAt || now - Date.parse(source.observedAt) >= 30 * 60000;
    }).map(r => r.code) }));
    const total = jobs.reduce((n, x) => n + x.regions.length, 0);
    let done = 0;
    if (!total) { setNotice("当前价格已在近期查询过；冷却中的地区会在到期后重试。"); working.current = false; return; }
    try {
      for (const job of jobs) {
        for (let offset = 0; offset < job.regions.length && !stop.current; offset += 20) {
          const regions = job.regions.slice(offset, offset + 20);
          setProgress({ done, total, product: job.product, label: `${PRODUCTS.find(p => p.id === job.product)?.name} · ${regions.length} 个地区` });
          const next = await readResponse(await fetch("/api/refresh", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product: job.product, regions, force }), signal: AbortSignal.timeout(100000) }));
          accept(next); done += regions.length;
          setProgress({ done, total, product: job.product, label: `${PRODUCTS.find(p => p.id === job.product)?.name}` });
          if (next.sourceCooldownUntil) { stop.current = true; break; }
        }
        if (stop.current) break;
      }
      if (mounted.current) setNotice(dataRef.current?.sourceCooldownUntil ? "官方来源暂时限流，已暂停后续查询；已取得的价格已保存。" : stop.current ? `已暂停，完成 ${done} 个地区查询，结果已保存。` : `更新完成，已处理 ${done} 个地区查询。未上架或失败的地区可在表格下方查看。`);
    } catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { working.current = false; if (mounted.current) setProgress(null); }
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    (async () => {
      try {
        const next = await readResponse(await fetch("/api/dashboard", { cache: "no-store", signal: AbortSignal.timeout(25000) }));
        if (!active) return;
        accept(next); setLoading(false);
        if (channelRef.current === "ios") void updateProducts(PRODUCTS.map(p => p.id), false);
      } catch (e) { if (active) { setError(errorMessage(e)); setLoading(false); } }
    })();
    return () => { active = false; mounted.current = false; stop.current = true; };
  // The initial load is intentionally independent of filter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { if (document.visibilityState === "visible" && !working.current) void updateProducts(PRODUCTS.map(p => p.id), false); }, 30 * 60000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible" || working.current) return;
      try {
        const wasCooling = !!dataRef.current?.sourceCooldownUntil;
        const next = await readResponse(await fetch("/api/dashboard", { cache: "no-store", signal: AbortSignal.timeout(20000) }));
        accept(next);
        if (auto && channelRef.current === "ios" && wasCooling && !next.sourceCooldownUntil) void updateProducts(PRODUCTS.map(p => p.id), false);
      } catch { /* Retain the last displayed snapshot. */ }
    }, 60000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const visibleRows = useMemo(() => comparisonRows(channel === "web" ? data?.checkoutRows || [] : data?.rows || [], basis) as DisplayRow[], [data, channel, basis]);
  const plans = useMemo(() => {
    const map = new Map<string, DisplayRow>();
    visibleRows.filter(r => r.product === product).forEach(row => { if (!map.has(row.planId)) map.set(row.planId, row); });
    return [...map.values()].sort((a,b) => a.planName.localeCompare(b.planName));
  }, [visibleRows, product]);
  const effectivePlan = plan;
  const planRows = useMemo(() => visibleRows.filter(r => r.product === product && r.planId === effectivePlan), [visibleRows, product, effectivePlan]);
  const ranked = useMemo(() => rankRows(planRows) as DisplayRow[], [planRows]);
  const cheapest = ranked[0];
  const selected = planRows[0];
  const sources = channel === "ios" ? data?.sources.filter(s => s.product === product) || [] : [];
  const attempted = sources.filter(s => s.attemptedAt && s.status !== "pending").length;
  const shownRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return planRows.filter(row => !q || `${row.region} ${row.regionName} ${row.currency}`.toLowerCase().includes(q))
      .sort((a,b) => sort === "region" ? a.regionName.localeCompare(b.regionName, "zh-CN") : (a.cny ?? Infinity) - (b.cny ?? Infinity));
  }, [planRows, query, sort]);
  const nonRows = REGIONS.filter(r => !planRows.some(row => row.region === r.code) && (!query.trim() || `${r.name} ${r.code}`.toLowerCase().includes(query.trim().toLowerCase())));
  const latest = visibleRows.reduce((latest, row) => row.observedAt > latest ? row.observedAt : latest, "");
  const totalChecked = channel === "web" ? visibleRows.length : data?.sources.filter(s => s.attemptedAt && s.status !== "pending").length || 0;
  function selectProduct(id: string) { setProduct(id); setPlan(viewPlan(DEFAULT_PLAN[id], channel)); setQuery(""); }
  function selectCard(p: typeof FEATURED[number]) { setProduct(p.product); setPlan(viewPlan(p.id, channel)); setQuery(""); document.getElementById("comparison")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark">订</span><span><strong>订阅观察</strong><small>AI PRICE MONITOR</small></span></a>
      <span className="nav-caption">工作台</span>
      <a href="#" className="nav-link active"><LayoutDashboard size={17}/>全球比价</a>
      <a href="#comparison" className="nav-link"><Globe2 size={17}/>各地区价格</a>
      <a href="#method" className="nav-link"><CircleHelp size={17}/>价格口径</a>
      <a href={serviceUrl("sidebar")} className="nav-link service-nav" target="_blank" rel="noopener noreferrer sponsored"><ArrowUpRight size={17}/>订阅代充服务</a>
      <div className="sidebar-bottom"><div className="channel-label"><span className="dot"/>{channel === "web" ? "网页结算记录" : "iOS App Store"}</div><p>4 个 AI 产品<br/>{REGIONS.length} 个国家与地区目录</p><small>同套餐 · 同币种汇率 · 同一比较口径</small></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><span>工作台 <span className="slash">/</span> <b>全球价格比较</b></span><div className="topbar-actions"><span className="source-badge">{channel === "web" ? "用户提供的结算记录" : "App Store 公开标价"}</span><a className="service-header" href={serviceUrl("header")} target="_blank" rel="noopener noreferrer sponsored">订阅代充 <ArrowUpRight size={15}/></a></div></header>
      <div className="content">
        <section className="page-heading"><div><div className="eyebrow">GLOBAL AI PRICING</div><h1>全球 AI 订阅价格比较</h1><p>ChatGPT、Claude、Gemini、Grok：各地区原价、税前估值与美元、人民币换算。</p></div><Button className="primary-action" disabled={!!progress || loading} onClick={() => updateProducts(PRODUCTS.map(p => p.id), true)}><RefreshCw size={16} className={progress ? "spin" : ""}/>{channel === "web" ? "更新参考汇率" : "更新各地区价格"}</Button></section>
        <section className="basis-panel" aria-label="选择比价口径"><div className="basis-controls"><label>渠道与价格口径<NativeSelect aria-label="渠道与价格口径" value={channel} onChange={e => changeChannel(e.target.value as "web" | "ios")}><NativeSelectOption value="ios">原价格表＋参考税率（默认）</NativeSelectOption><NativeSelectOption value="web">网页结算记录</NativeSelectOption></NativeSelect></label>{channel === "ios" ? <label>最低价比较方式<NativeSelect aria-label="最低价比较方式" value={basis} onChange={e => setBasis(e.target.value as "net" | "gross")}><NativeSelectOption value="net">按免税估算价比较</NativeSelectOption><NativeSelectOption value="gross">按原价比较</NativeSelectOption></NativeSelect></label> : <span>使用结算明细中的税前金额</span>}</div><p>{channel === "web" ? "智利 Pro 5x 的网页结算截图单独保留，供核对实际结算金额。" : `免税估算价＝原价 ÷（1＋参考税率）。假设原价已含该税率；原价来源为 iOS App Store，估值不等同于网页实际结算价。已收录 ${TAX_COVERAGE} 个地区的可计算税率，核查日期 ${TAX_REVIEWED_AT}。`}</p></section>
        <section className="status-strip" aria-label="价格与汇率状态"><div><Clock3 size={16}/><span>{channel === "web" ? "结算记录入库" : "最近标价查询"} <b>{time(latest)}</b></span></div><div><span>参考汇率</span><b>{data?.fx.usdToCny ? `1 USD = ${data.fx.usdToCny.toFixed(4)} CNY` : "获取中…"}</b><span className="fx-date">{data?.fx.date ? new Date(data.fx.date).toLocaleDateString("zh-CN") : ""}</span></div><label className="auto-switch"><Switch checked={auto} onCheckedChange={setAuto} aria-label={channel === "web" ? "每30分钟更新参考汇率" : "每30分钟更新公开标价"}/><span>{channel === "web" ? "每 30 分钟更新参考汇率" : "每 30 分钟更新公开标价"}</span></label></section>
        {progress && <div className="update-progress" role="status"><div><Loader2 className="spin" size={16}/><span>正在查询 {progress.label}</span><b>{progress.done} / {progress.total}</b><Button size="sm" variant="ghost" onClick={() => { stop.current = true; setNotice("正在完成当前批次，随后暂停。"); }}><Square size={12}/>暂停</Button></div><progress value={progress.done} max={progress.total}/><small>结果分批保存并更新。{notice.startsWith("正在") ? notice : "可继续切换套餐查看已取得的价格。"}</small></div>}
        {error && <div className="alert error" role="alert">{error}<Button variant="outline" size="sm" onClick={async () => { setError(""); try { accept(await readResponse(await fetch("/api/dashboard", { cache: "no-store" }))); } catch(e) { setError(errorMessage(e)); } }}>重新读取</Button></div>}
        {data?.fx.error && <div className="alert" role="status">{data.fx.error}</div>}
        {channel === "ios" && data?.sourceCooldownUntil && <div className="alert" role="status">官方来源暂时限流，已暂停价格查询。{time(data.sourceCooldownUntil)} 后可重试；下方仍显示已取得的价格。</div>}
        {!progress && notice && <div className="notice" role="status">{notice}</div>}
        <section aria-labelledby="lowest-heading"><div className="section-heading"><div><TrendingDown size={19}/><h2 id="lowest-heading">{channel === "web" ? "各套餐 · 税前结算参考" : basis === "net" ? "已查询地区 · 税前估算最低价" : "已查询地区 · 原价最低价"}</h2></div><span>{channel === "web" ? `已收录 ${totalChecked} 条结算记录 · 非实时核价` : `已查询 ${totalChecked} / ${REGIONS.length * PRODUCTS.length} 个产品地区组合`}</span></div>
          <div className="winner-grid">{FEATURED.map((item, index) => {
            const itemPlan = viewPlan(item.id, channel);
            const options = visibleRows.filter(row => row.planId === itemPlan);
            const valid = rankRows(options) as DisplayRow[];
            const reference = channel === "web" ? options.filter(r => r.cny != null && r.amount != null).sort((a,b) => a.cny!-b.cny!)[0] : undefined;
            const winner = valid[0] || reference;
            const ties = winner ? valid.filter(r => Math.round(r.cny! * 100) === Math.round(winner.cny! * 100)) : [];
            const checked = data?.sources.filter(s => s.product === item.product && s.attemptedAt && s.status !== "pending").length || 0;
            return <button key={item.id} className={`winner-card ${index < 3 ? "featured" : ""} ${effectivePlan === itemPlan ? "selected" : ""}`} onClick={() => selectCard(item)}>
              <div className="winner-top"><span className={`product-mark ${item.product}`}>{PRODUCTS.find(p => p.id === item.product)?.mark}</span><strong>{item.label}</strong><ArrowUpRight size={17}/></div>
              <div className="winner-price">{winner ? <><span>¥</span>{money(winner.cny)}</> : <span className="waiting">{loading ? "读取中…" : channel === "web" ? "税前价待核实" : "暂无可比价格"}</span>}<small>{channel === "web" ? winner ? "月付 · 截图参考" : "结算参考" : basis === "net" ? "免税估算" : "原价换算"}</small></div>
              <div className="winner-location">{winner ? <><span className="flag">{flag(winner.region)}</span><b title={ties.map(r => r.regionName).join("、")}>{winner.regionName}{ties.length > 1 ? ` 等 ${ties.length} 地区` : ""}</b><span>{winner.currency} {money(winner.amount)}</span></> : <span>{channel === "web" ? "缺少网页结算明细" : "等待该套餐的地区价格"}</span>}</div>
              {channel === "ios" && winner && <div className="winner-tax">原价 {winner.currency} {money(winner.listingAmount)} · 参考税率 {winner.taxEstimate?.label || "待补充"}<small>{cycle(winner)}</small></div>}
              <div className="winner-bottom"><span>{winner ? `≈ US$ ${money(winner.usd)}` : "—"}</span><span>{channel === "web" ? options.length ? `${options.length} 地区参考 · 不代表最低` : "未参与税前排名" : `可比 ${valid.length} · 已查 ${checked}/${REGIONS.length}`}</span></div>
            </button>;
          })}</div>
          <p className="ranking-note">{channel === "web" ? "截图报价保留原始提供日期，刷新汇率不改变报价日期；本记录不参与实时最低价排名。" : `排名覆盖已取得的同名同档价格，采用 ${data?.freshHours || 6} 小时内有效标价与可用汇率。${basis === "net" ? "缺少可计算税率的地区保留原价，不参与免税估算排名。" : "当前卡片和排名使用原价，税前估值仍在表格旁列显示。"}`}</p>
        </section>

        <section className="service-bridge" aria-label="订阅办理服务"><div><span className="service-overline">GPT国际订阅 · gptpro20.com</span><strong>选好套餐，需要代充？</strong><p>查看 ChatGPT、Claude、Gemini、Grok 订阅与代充服务。这里的公开价格用于地区比较，服务报价以商城商品及订单确认为准。</p></div><a href={serviceUrl("comparison", product)} target="_blank" rel="noopener noreferrer sponsored">查看订阅代充服务 <ArrowUpRight size={17}/></a></section>

        <section id="comparison" className="comparison-panel" aria-labelledby="comparison-heading">
          <div className="comparison-title"><div><div className="eyebrow">REGIONAL PRICE COMPARISON</div><h2 id="comparison-heading">各国家与地区价格</h2></div><Button variant="outline" disabled={!!progress || loading} onClick={() => updateProducts([product], true)}><RefreshCw size={14}/>{channel === "web" ? "更新参考汇率" : "更新当前产品"}</Button></div>
          <div className="product-tabs" role="tablist" aria-label="选择AI产品">{PRODUCTS.map(p => <Button role="tab" aria-selected={product === p.id} key={p.id} className={product === p.id ? "product-tab active" : "product-tab"} variant="ghost" onClick={() => selectProduct(p.id)}><span className={`mini-mark ${p.id}`}>{p.mark}</span>{p.name}</Button>)}</div>
          <div className="table-filters"><label className="plan-select"><span>比较套餐</span><NativeSelect aria-label="比较套餐" value={effectivePlan} onChange={e => setPlan(e.target.value)}>{!plans.some(p => p.planId === plan) && <NativeSelectOption value={plan}>{FEATURED.find(p => viewPlan(p.id, channel) === plan)?.label || "所选套餐"} · 暂无数据</NativeSelectOption>}{plans.map(p => <NativeSelectOption key={p.planId} value={p.planId}>{p.planName} · {cycle(p)}</NativeSelectOption>)}</NativeSelect></label><label className="search-box"><Search size={16}/><Input aria-label="搜索国家或币种" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索国家、地区或币种"/></label><NativeSelect aria-label="价格排序" value={sort} onChange={e => setSort(e.target.value)}><NativeSelectOption value="cny">人民币从低到高</NativeSelectOption><NativeSelectOption value="region">按地区名称</NativeSelectOption></NativeSelect></div>
          <div className="table-summary"><span><b>{selected?.planName || FEATURED.find(p => viewPlan(p.id, channel) === plan)?.label || "所选套餐"}</b> <span className="period-tag">{cycle(selected)}</span></span><span>{channel === "web" ? `已收录 ${planRows.length} 个地区的结算记录；其余待核实` : `已查 ${attempted}/${REGIONS.length} 地区 · ${planRows.length} 条原价 · ${ranked.length} 个可比${basis === "net" ? "税前估值" : "标价"}`}</span></div>
          {selected?.cycle === "unknown" && <div className="cycle-note">来源未标明此条目的计费周期；这里比较同名条目的公开标价。同名不同价会按价格档位拆开，不能据此认定为月付或年付。</div>}
          <Table className="price-table tax-table"><TableHeader><TableRow><TableHead className="rank-col">排名</TableHead><TableHead>国家 / 地区</TableHead><TableHead className="numeric">{channel === "web" ? "套餐展示价" : <>原价<small>本币／美元／人民币</small></>}</TableHead><TableHead className="numeric">{channel === "web" ? "本次税额" : "参考税率"}</TableHead><TableHead className="numeric">{channel === "web" ? "结算税前价" : <>免税估算价<small>本币</small></>}</TableHead><TableHead className="numeric">{channel === "web" ? "税前美元" : <>税前美元<small>估算</small></>}</TableHead><TableHead className="numeric cny-head">{channel === "web" ? "税前人民币" : <>税前人民币<small>估算</small></>} {basis === "net" && <ArrowDown size={13}/>}</TableHead><TableHead>来源与时间</TableHead><TableHead>核对</TableHead></TableRow></TableHeader><TableBody>
            {shownRows.map(row => {
              const index = ranked.findIndex(r => r.id === row.id);
              const estimate = row.taxEstimate;
              const netAmount = channel === "web" ? row.netAmount : estimate?.amount;
              const netUsd = channel === "web" ? row.usd : estimate?.usd;
              const netCny = channel === "web" ? row.cny : estimate?.cny;
              return <TableRow key={row.id} className={row.id === cheapest?.id ? "lowest-row" : ""}><TableCell className="rank-col"><span className={index === 0 ? "rank first" : "rank"}>{index >= 0 ? index + 1 : "—"}</span></TableCell><TableCell><div className="country"><span className="flag">{flag(row.region)}</span><div><b>{row.regionName}</b><small>{row.region}{index === 0 && <span className="lowest-badge">{basis === "net" ? "估算最低" : "原价最低"}</span>}</small></div></div></TableCell>
              <TableCell className="numeric"><b>{row.currency} {money(row.listingAmount)}</b>{channel === "ios" ? <><small>US$ {money(row.originalUsd)}</small><small>¥ {money(row.originalCny)}</small></> : <small>套餐选择区金额</small>}</TableCell>
              <TableCell className="numeric tax-rate-cell">{channel === "web" ? <><b>{row.currency} {money(row.taxAmount)}</b><small>本次应付 {money(row.checkoutTotal)}</small></> : <>{estimate?.sourceUrl ? <a href={estimate.sourceUrl} target="_blank" rel="noreferrer" title={`${estimate.note} 核查日期：${estimate.reviewedAt}`} aria-label={`查看${row.regionName}参考税率依据`}>{estimate.label} ↗</a> : <b>{estimate?.label || "待补充"}</b>}<small>{estimate?.percent == null ? estimate?.note || "未设置参考税率" : estimate.percent === 0 ? "参考 VAT／销售税为 0" : "标准／服务参考税率"}</small></>}</TableCell>
              <TableCell className="numeric"><b>{netAmount == null ? "—" : `${row.currency} ${money(netAmount)}`}</b><small>{channel === "web" ? "结算明细小计" : estimate?.percent != null ? `原价 ÷ ${Number((1 + estimate.percent / 100).toFixed(5))}` : "原价保留，暂不倒算"}</small></TableCell>
              <TableCell className="numeric usd">{netUsd == null ? "—" : `US$ ${money(netUsd)}`}</TableCell><TableCell className="numeric cny">{netCny == null ? "—" : `¥ ${money(netCny)}`}{channel === "web" ? <small className="stale-label">结算参考 · 非实时</small> : !row.fresh ? <small className="stale-label">待更新 · 不参与排名</small> : netCny != null && <small>按参考税率估算</small>}</TableCell>
              <TableCell className="observed">{channel === "web" ? `${row.reportedDate} 用户提供` : time(row.observedAt)}<small>{channel === "web" ? "截图时间未注明" : row.ambiguous ? "同名多价 · 请核对" : cycle(row)}</small>{channel === "ios" && estimate?.reviewedAt && <small>税率 {estimate.reviewedAt}</small>}</TableCell><TableCell><div className="row-actions"><a href={row.sourceUrl} target={channel === "web" ? undefined : "_blank"} rel="noreferrer" aria-label={`查看${row.regionName}价格依据`} title="价格依据"><ArrowUpRight size={17}/></a>{channel === "ios" && <Button size="icon-sm" variant="ghost" disabled={!!progress} onClick={() => updateProducts([product], true, [row.region])} aria-label={`更新${row.regionName}价格`} title="更新该地区"><RefreshCw size={14}/></Button>}</div></TableCell></TableRow>;
            })}
            {!shownRows.length && <TableRow><TableCell colSpan={9}><div className="empty-state">{loading ? <><Loader2 size={23} className="spin"/><b>正在读取价格资料</b></> : <><Globe2 size={25}/><b>{query ? "没有匹配的地区" : channel === "web" ? "该套餐的网页税前价尚待核实" : "该套餐暂未取得有效价格"}</b><span>{channel === "web" ? "需要结算明细中的小计、税额和应付金额；不使用 App Store 标价填补。" : "点击更新当前产品，或查看下方地区查询状态。"}</span></>}</div></TableCell></TableRow>}
          </TableBody></Table>
          <div className="table-footer"><span>显示 {shownRows.length} 条 · {channel === "web" ? "结算税前额" : "原价 ÷（1＋参考税率）"} ÷ 每美元本币汇率 × 美元兑人民币</span><span>{channel === "web" ? "以本次结算记录为依据" : `当前按${basis === "net" ? "免税估算" : "原价"}人民币排名`} · 不含付款手续费</span></div>
          <details className="source-status"><summary>{channel === "web" ? "待核实的其他地区" : "其他地区与查询状态"} <span>{nonRows.length} 个地区</span></summary><div className="status-list">{nonRows.map(region => {
            const state = sources.find(s => s.region === region.code);
            const label = channel === "web" ? "网页税前价待核实" : !state || state.status === "pending" ? "尚未查询" : state.status === "ok" ? "未公开此套餐" : state.error || "查询失败";
            return <div className="source-item" key={region.code}><span>{flag(region.code)} {region.name}<small>{region.code}</small></span><span>{label}{state?.retryAt && Date.parse(state.retryAt) > Date.now() && <small>可重试：{time(state.retryAt)}</small>}</span>{channel === "ios" && <><a href={sourceFor(product, region.code)} target="_blank" rel="noreferrer">来源 ↗</a><Button size="sm" variant="ghost" disabled={!!progress || !!(state?.retryAt && Date.parse(state.retryAt) > Date.now())} onClick={() => updateProducts([product], true, [region.code])}>查询</Button></>}</div>;
          })}</div></details>
        </section>
        <section id="checkout-evidence" className="checkout-evidence"><h2>智利 Pro 5x · 本次结算依据</h2><p>来源：用户于 2026-09-20 提供的网页结算截图，月付 5x。截图未注明拍摄时间，未独立在线复核。</p><dl><div><dt>套餐展示价</dt><dd>CLP 102,990</dd></div><div><dt>Monthly subscription</dt><dd>CLP 86,365</dd></div><div><dt>Sales Tax (0%)</dt><dd>CLP 0</dd></div><div><dt>Due today</dt><dd>CLP 86,365</dd></div></dl><p>本记录按 CLP 86,365 换算。展示价与结算小计的差异原因未核实，不据此推算其他国家或其他套餐的免税价。</p></section>
        <section id="method" className="method"><div><h3>免税估算怎么计算</h3><p>把原表标价按含参考税率处理，除以（1＋税率），再换算美元与人民币。估算用于比较，不代表实际结算必然免税；未设置税率时保留原价。</p></div><div><h3>税率与结算依据</h3><p>参考 <a href="https://taxsummaries.pwc.com/quick-charts/value-added-tax-vat-rates" target="_blank" rel="noreferrer">PwC 税率资料</a>、<a href="https://europa.eu/youreurope/business/finance-and-tax/vat/vat-rules-rates/index_en.htm" target="_blank" rel="noreferrer">欧盟官方税率表</a>及当地税务机关，核查日期 {TAX_REVIEWED_AT}。每行税率可点击查看来源。网页结算截图另行展示，不混入 App Store 估算排名。</p></div><div><h3>价格与汇率更新</h3><p><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API ↗</a> 提供每日参考汇率。开启自动更新后，页面打开期间每 30 分钟查询价格；刷新价格和汇率不改变税率核查日期。实际扣款可能包含渠道汇差与手续费。</p></div></section>
        <section className="pricing-faq" aria-labelledby="faq-heading"><h2 id="faq-heading">使用前，你可能想了解</h2>
          <details><summary>这些价格是网页订阅价格吗？</summary><p>默认数据来自各地区 Apple App Store 公开内购列表。网页订阅、App Store 和代充服务属于不同购买渠道，价格与可用套餐可能不同；可在上方切换查看单独收录的网页结算记录。</p></details>
          <details><summary>税前估算最低的地区，就能按这个金额购买吗？</summary><p>不一定。估算按“原价已含参考税率”的假设计算，并不表示具备免税资格。排名只覆盖已查询且可比较的地区，实际可购买地区、周期、税额和手续费以结算页面为准。</p></details>
          <details><summary>价格多久更新，需要登录账号吗？</summary><p>查询无需登录 AI 账号。页面会先读取已保存结果；开启自动更新后，在页面打开期间每 30 分钟尝试查询。遇到来源限流会暂停，超过有效期的价格不参与最低价排名。</p></details>
          <details><summary>选好套餐后，在哪里查看代充服务？</summary><p>可前往 <a href={serviceUrl("faq", product)} target="_blank" rel="noopener noreferrer sponsored">gptpro20.com 查看订阅代充服务</a>，确认商品套餐、适用条件和交付说明后再下单。本工具的价格估值不是代充报价。</p></details>
        </section>
        <footer className="page-footer"><span>订阅观察 · 由 <a href={serviceUrl("footer")} target="_blank" rel="noopener noreferrer sponsored">GPT国际订阅</a> 维护</span><span>独立价格比较工具，与各 AI 产品官方及 Apple 无隶属关系。</span></footer>
      </div>
    </main>
  </div>;
}
