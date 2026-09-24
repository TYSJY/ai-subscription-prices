export const SITE_URL = "https://ai-pricing-live.gptpro200x.chatgpt.site";
export const SITE_TITLE = "全球 AI 订阅价格比较｜ChatGPT、Claude、Gemini、Grok";
export const SITE_DESCRIPTION = "查询 AI 订阅在不同国家和地区的公开价格，比较参考税率、税前估算、美元与人民币金额。支持 ChatGPT Plus、Pro 5x、Pro 20x 及其他 AI 套餐。";

// Fixed public destination. No account, session or payment information is sent.
export function serviceUrl(placement: string, product?: string) {
  const url = new URL("https://gptpro20.com/");
  url.searchParams.set("utm_source", "ai-pricing-live");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", "ai-subscription-comparison");
  url.searchParams.set("utm_content", placement);
  if (product) url.searchParams.set("utm_term", product);
  return url.toString();
}
