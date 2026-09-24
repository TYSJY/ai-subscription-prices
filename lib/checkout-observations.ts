// Transcription of the user's supplied checkout, not an automatically fetched
// global price. Payment details and the screenshot itself are never published.
export const INITIAL_CHECKOUT_OBSERVATIONS = [{
  id: "user-checkout-chatgpt-cl-pro5x-2026-09-20",
  product: "chatgpt", region: "CL", regionName: "智利",
  name: "ChatGPT Pro 5x", planId: "chatgpt:pro-5x:month:1", planName: "ChatGPT Pro 5x",
  currency: "CLP", cycle: "month" as const, variant: 1, ambiguous: false,
  listingAmount: 102990, netAmount: 86365, taxAmount: 0, checkoutTotal: 86365,
  channel: "web" as const, taxBasis: "exclusive" as const, sourceKind: "user_checkout" as const,
  sourceUrl: "#checkout-evidence", reportedDate: "2026-09-20",
  evidenceNote: "用户于 2026-09-20 提供的网页结算截图。截图未标拍摄时间；本次小计 CLP 86,365，Sales Tax (0%) 为 CLP 0，应付 CLP 86,365。仅代表该次结算条件，未独立在线核验。",
}];
