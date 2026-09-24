// Reference rates reviewed on this date, not live tax determinations for an account.
// Each estimate explicitly assumes that the listed price includes this tax.
export const TAX_REVIEWED_AT = '2026-09-20';
const PWC = 'https://taxsummaries.pwc.com/quick-charts/value-added-tax-vat-rates';
const EU = 'https://europa.eu/youreurope/business/finance-and-tax/vat/vat-rules-rates/index_en.htm';

// Numeric facts from the cited standard VAT/GST tables. Complex or transitional
// rules are excluded below instead of choosing a convenient rate or treating NA as 0.
const standard = {
  AL:20, AO:14, AR:21, AM:20, AU:10, AZ:18, BS:10, BH:10, BD:15, BB:17.5,
  BA:17, BW:14, CV:15, KH:10, CM:19.25, TD:18, CL:19, CO:19, CD:16,
  CG:18.9, CR:13, DO:18, EC:15, EG:14, SV:13, GQ:15, SZ:15, ET:15,
  GA:18, GE:18, GT:12, GY:14, HN:15, IS:24, IN:18, IL:18, CI:18,
  JM:15, JP:10, JO:16, KZ:16, KE:16, KR:10, XK:18, LA:10, LB:11,
  LI:8.1, MG:20, MY:8, MR:16, MU:15, MX:16, MD:20, MN:10, ME:21,
  MA:20, MZ:16, MM:5, NA:15, NZ:15, NI:15, NG:7.5, MK:18, NO:25,
  OM:5, PA:7, PG:10, PY:10, PE:18, PH:12, RW:18, LC:12.5, SA:15,
  SN:18, RS:20, SG:9, ZA:15, CH:8.1, TW:5, TH:7, TT:12.5, TN:19,
  TR:20, UG:18, UA:20, AE:5, GB:20, UY:22, UZ:12, VE:16, ZM:16,
};
const european = {
  AT:20, BE:21, BG:20, CY:19, CZ:21, DE:19, DK:25, EE:24, GR:24,
  ES:21, FI:25.5, FR:20, HR:25, HU:27, IE:23, IT:22, LT:21, LU:17,
  LV:21, MT:18, NL:21, PL:23, PT:23, RO:21, SK:23, SI:22, SE:25,
};
/** @type {Record<string, {percent:number|null,label:string,sourceUrl:string,sourceName:string,reviewedAt:string,note:string}>} */
const rates = {};
function setRate(code, percent, sourceUrl, note = '按当地标准 VAT/GST 税率估算；未核验本商品税类。', label) {
  rates[code] = {percent, label: label ?? `${percent}%`, sourceUrl,
    sourceName: sourceUrl === EU ? '欧盟官方税率表' : sourceUrl.includes('taxsummaries.pwc.com') ? 'PwC Worldwide Tax Summaries' : '税务机关',
    reviewedAt:TAX_REVIEWED_AT, note};
}
for (const [code, percent] of Object.entries(standard)) setRate(code, percent, PWC);
for (const [code, percent] of Object.entries(european)) setRate(code, percent, EU, '按标准 VAT 税率估算；特殊税区及商品例外未计入。');
setRate('CL',19,'https://www.sii.cl/vat/faq1_eng.html','数字服务 VAT 参考税率；按原价含 19% 税估算。');
setRate('GB',20,'https://www.gov.uk/vat-rates');
setRate('SG',9,'https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/current-gst-rates');
setRate('ID',11,'https://taxsummaries.pwc.com/indonesia/corporate/other-taxes','多数非奢侈品及服务按 12% × 11/12 税基，实际参考税率 11%。');
setRate('MY',8,PWC,'使用服务税 8%，不是商品销售税 10%；具体数字服务税类待结算核对。');
setRate('IN',18,PWC,'多数服务 GST 参考税率 18%；商品分类差异未计入。');
setRate('CG',18.9,PWC,'参考合计税率：18% VAT 加其税额的 5% 附加税。');
setRate('HK',0,'https://taxsummaries.pwc.com/hong-kong-sar/corporate/other-taxes','未征收 VAT、GST 或一般销售税，估算保留原价。');
setRate('QA',0,'https://taxsummaries.pwc.com/qatar/corporate/other-taxes','截至核查日未征收 VAT 或销售税，估算保留原价。');
setRate('KW',0,'https://taxsummaries.pwc.com/kuwait/corporate/other-taxes','VAT 尚未实施，按 VAT 0% 保留原价。');
setRate('BN',0,'https://taxsummaries.pwc.com/brunei-darussalam/corporate/other-taxes','未征收 VAT 或销售税，估算保留原价。');
setRate('MO',0,'https://taxsummaries.pwc.com/macau-sar/corporate/other-taxes','未设 VAT 制度，消费税限烟酒，数字订阅估算保留原价。');
setRate('LY',0,'https://taxsummaries.pwc.com/libya/corporate/other-taxes','未征收 VAT，按 VAT 0% 保留原价；其他合同税费未计入。');

const variable = {
  US:['依州／地方','https://taxsummaries.pwc.com/united-states/corporate/other-taxes','无联邦统一销售税率；州、地方及数字服务税类不同。'],
  CA:['5%–15%',PWC,'联邦与省税合计依账单省份变化，不能用一个国家税率倒算。'],
  BR:['多税种',PWC,'联邦、州和市级税并存；未确定本商品的合计税率。'],
  PK:['15%–16%',PWC,'服务税依省份变化。'],
  BO:['13% · 计税待核对','https://taxsummaries.pwc.com/bolivia/corporate/other-taxes','计税基数新旧规则处于转换期，生效细则待核对。'],
  GH:['15%＋附加税',PWC,'另有 NHIL、GETFL 附加税；本商品合计税负待核对。'],
  CN:['按服务税类',PWC,'税率依商品或服务类别而定。'],
  IQ:['按服务税类',PWC,'没有适用于所有数字订阅的统一参考税率。'],
  LR:['13%／15%',PWC,'GST 与 VAT 制度、适用日期待核对。'],
  TZ:['15%／18%',PWC,'大陆、桑给巴尔及服务类别存在差异。'],
  VN:['按服务税类',PWC,'一般税率、减税及数字服务计税规则不同，暂不套用统一税率。'],
};
for (const [code, [label, sourceUrl, note]] of Object.entries(variable)) setRate(code,null,sourceUrl,note,label);
export const TAX_RATES = Object.freeze(rates);
export function taxRateFor(region) {
  return TAX_RATES[region] ?? {percent:null,label:'待补充',sourceUrl:null,sourceName:null,reviewedAt:null,note:'尚未收录可直接用于除税计算的参考税率。'};
}
