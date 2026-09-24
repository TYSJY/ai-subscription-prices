// Shared by the server and regression checks. Never infer billing periods from price alone.
export function parseAmount(displayPrice, currency = '') {
  let text = String(displayPrice).normalize('NFKC')
    .replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (x) => String(x.charCodeAt(0) - 0x6f0))
    .replace(/\u066b/g, '.').replace(/\u066c/g, ',');
  if (/[-−]\s*\d/.test(text)) return null;
  const multiplier = /juta\b/i.test(text) ? 1000000 : /ribu\b/i.test(text) ? 1000 : 1;
  text = text.replace(/[^\d.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (!text || !/\d/.test(text)) return null;
  const dot = text.lastIndexOf('.'), comma = text.lastIndexOf(',');
  const last = Math.max(dot, comma);
  if (last >= 0) {
    const tail = text.length - last - 1;
    // Localized fractions have 1–2 decimals; three digits indicate a thousands group.
    const threeDecimals = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'].includes(currency);
    const decimal = (tail > 0 && tail <= 2) || ((multiplier > 1 || threeDecimals) && tail > 0 && tail <= 3);
    text = decimal ? text.slice(0, last).replace(/[.,]/g, '') + '.' + text.slice(last + 1)
      : text.replace(/[.,]/g, '');
  }
  const amount = Number(text) * multiplier;
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 1000) / 1000 : null;
}

export function extractApplePage(html) {
  let currency = null;
  const ld = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(ld)) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const c = item?.offers?.priceCurrency;
        if (typeof c === 'string' && /^[A-Z]{3}$/.test(c)) currency = c;
      }
    } catch { /* Invalid upstream metadata is not a currency guess. */ }
  }
  const sections = [];
  const pattern = /"\$kind":"AnnotationItem","textPairs":(\[\[[\s\S]*?\]\])/g;
  for (const match of html.matchAll(pattern)) {
    try {
      const pairs = JSON.parse(match[1]);
      if (!Array.isArray(pairs)) continue;
      const list = pairs.filter(x => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' && /\d/.test(x[1]));
      if (list.length) sections.push(list);
    } catch { /* Ignore malformed embedded sections. */ }
  }
  const pairs = sections.sort((a,b) => b.length-a.length)[0] || [];
  const prices = pairs.map(([name, displayPrice]) => ({ name: name.trim(), displayPrice: displayPrice.trim() }))
    .filter((x,i,all) => all.findIndex(y => x.name === y.name && x.displayPrice === y.displayPrice) === i);
  return { currency, prices };
}

export function normalizePrices(product, region, regionName, page, sourceUrl, observedAt) {
  const subscriptions = page.prices.filter(({name}) => !/\bcredits?\b|extra usage|usage credits|充值|积分/i.test(name) && (product !== 'gemini' || /\bAI\b/i.test(name)));
  const groups = new Map();
  for (const raw of subscriptions) {
    const normalizedName = raw.name.normalize('NFKC').replace(/[–—‑]/g, '-').replace(/\s+/g, ' ').trim();
    const key = normalizedName.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...raw, normalizedName, amount: parseAmount(raw.displayPrice, page.currency) });
  }
  const rows = [];
  for (const [nameKey, list] of groups) {
    list.sort((a,b) => (a.amount ?? Infinity)-(b.amount ?? Infinity));
    list.forEach((raw,index) => {
      const cycle = /\b(annual|annually|yearly|year)\b|年付|每年/i.test(raw.name) ? 'year'
        : /\b(monthly|month)\b|月付|每月/i.test(raw.name) ? 'month' : 'unknown';
      // Exact names and price-ranked duplicate slots stay distinct. They are public
      // label comparisons, never a claim that Apple exposes the same underlying SKU.
      let base = nameKey.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
      if (product === 'chatgpt') {
        if (/chatgpt plus/.test(nameKey)) base = 'plus';
        else if (/pro\s*5x/.test(nameKey)) base = 'pro-5x';
        else if (/pro\s*20x/.test(nameKey)) base = 'pro-20x';
        else if (/chatgpt go/.test(nameKey)) base = 'go';
      }
      const variant = index+1;
      const planId = `${product}:${base}:${cycle}:${variant}`;
      const planName = raw.normalizedName + (index > 0 ? ` · 同名第${variant}档` : '');
      rows.push({ id: `${region}:${planId}`, product, region, regionName,
        name: raw.name, planId, planName, currency: page.currency || '', amount: raw.amount,
        displayPrice: raw.displayPrice, cycle, ambiguous: list.length > 1,
        variant, sourceUrl, observedAt });
    });
  }
  return rows;
}

export function convertAmount(amount, currency, rates) {
  if (!(amount > 0) || !(rates?.[currency] > 0) || !(rates?.USD > 0) || !(rates?.CNY > 0)) return { usd: null, cny: null };
  const usd = amount / rates[currency];
  return { usd, cny: usd * rates.CNY };
}

export function rankRows(rows) {
  return rows.filter(r => r.fresh && Number.isFinite(r.cny) && r.cny > 0)
    .sort((a,b) => a.cny-b.cny || a.region.localeCompare(b.region));
}

// Net price comes from checkout evidence, never from an assumed country VAT.
export function checkoutNetAmount(quote) {
  if (quote.channel !== 'web' || quote.taxBasis !== 'exclusive') return null;
  const {netAmount, taxAmount, checkoutTotal} = quote;
  if (!Number.isFinite(netAmount) || !(netAmount > 0) || !Number.isFinite(taxAmount) || taxAmount < 0 || !Number.isFinite(checkoutTotal)) return null;
  if (Math.abs(netAmount + taxAmount - checkoutTotal) > 0.005) return null;
  return netAmount;
}

// This is a scenario estimate, not proof of the tax included in an Apple price.
// Keep all arithmetic unrounded until display so close regional rankings are stable.
export function estimateTaxExclusive(row, rate) {
  const percent = rate?.percent;
  const valid = Number.isFinite(percent) && percent >= 0 && percent <= 100;
  const divide = value => valid && Number.isFinite(value) && value > 0 ? value / (1 + percent / 100) : null;
  const amount = divide(row.amount);
  return {...rate, method:'assume_list_price_includes_reference_tax',
    amount, usd:divide(row.usd), cny:divide(row.cny),
    taxAmount:amount == null ? null : row.amount - amount};
}

export function comparisonRows(rows, basis = 'net') {
  return rows.map(row => ({...row, originalUsd:row.usd, originalCny:row.cny,
    ...(basis === 'net' && row.channel === 'ios' ? {
      amount:row.taxEstimate?.amount ?? null,
      usd:row.taxEstimate?.usd ?? null,
      cny:row.taxEstimate?.cny ?? null,
    } : {})}));
}
