# 全球 AI 订阅价格查询

**AI Subscription Prices** · ChatGPT / Claude / Gemini / Grok

查询不同国家与地区的公开订阅标价，换算美元和人民币，并对照参考税率查看税前估算。

**[打开在线查价站](https://ai-pricing-live.gptpro200x.chatgpt.site/?utm_source=github&utm_medium=readme&utm_campaign=ai-subscription-prices)** · [English](README.en.md) · [价格口径](docs/DATA-SOURCES.md) · [本地运行与部署](docs/DEPLOYMENT.md)

![AI subscription price comparison](docs/images/price-comparison.jpg)

2026-09-24 在线站点实拍。截图仅展示界面及当时记录，当前价格请打开在线站点核对。

## 能查什么

| 功能 | 说明 |
| --- | --- |
| 地区公开价格 | 从 ChatGPT、Claude、Gemini、Grok 的地区 App Store 页面读取公开内购标价 |
| 三种币种视图 | 显示当地币、美元和人民币；保留汇率日期 |
| 参考税率 | 展示税率依据、核查日期，以及按含税假设计算的税前估值 |
| 套餐比较 | 按产品、套餐、地区筛选；在有效数据中比较原价或税前估算 |
| 来源核对 | 保留价格来源链接、查询时间和查询状态 |
| 缓存与更新 | D1 缓存、查询冷却及限流保护；页面打开时可启用每 30 分钟更新 |

App Store 标价与网页订阅价可能不同。本项目不查询用户账户，也不访问私人账单；已有的匿名网页结算示例单独展示，不参与当前最低价排名。当前版本不提供历史价格走势图或无人值守的全量定时采集。

## 如何使用

1. 打开在线查价站，选择产品和套餐。
2. 查看原价、参考税率和换算价格；根据需要切换比较口径。
3. 核对每条记录的来源与查询时间。没有有效数据时，使用页面的更新按钮。
4. 购买前在实际结算页面确认套餐、计费周期及应付金额。

“最低”仅指已取得、满足时效与比较条件的数据，不代表所有地区的最终可购买价格。

## 订阅协助服务

本项目由 **TYSJY** 维护。维护者同时经营 **[gptpro20.com 订阅代充服务](https://gptpro20.com/?utm_source=github&utm_medium=readme&utm_campaign=ai-subscription-prices&utm_content=service)**。

如需了解订阅办理方式和服务报价，可访问上述网站咨询。查价工具可独立使用，查询结果不构成服务报价。该服务属于维护者的商业业务；本项目及该服务不代表 OpenAI、Anthropic、Google 或 xAI 的官方渠道。

## 本地运行

需要 Node.js **22.13 或更高版本**，以及 **pnpm 11.25.0**。

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

打开 http://127.0.0.1:5173 。本地开发使用本机 D1 模拟数据库，无需 Cloudflare 登录。首次运行数据库没有地区价格缓存；外部来源不可达时会显示缺失或失败状态，不会补入虚构价格。

```bash
pnpm test
pnpm build
```

生产环境需要 Cloudflare Workers 与 D1，详见 [部署说明](docs/DEPLOYMENT.md)。GitHub 仓库用于源码和文档展示，当前完整应用不适用于 GitHub Pages 静态托管。

## 数据与计算

- 公开价格来源：各地区的 [Apple App Store](https://apps.apple.com/)。
- 参考汇率：[ExchangeRate-API](https://www.exchangerate-api.com/)。
- 税率依据：在 `lib/tax-rates.mjs` 和页面各行来源链接中记录。
- 税前估算：`标价 ÷ (1 + 参考税率)`，计算假设和限制见 [数据说明](docs/DATA-SOURCES.md)。

## 贡献与反馈

价格或税率不符时，请使用仓库的“价格或税率纠错”模板，附产品、地区、查询日期和公开来源。代码问题使用“功能问题”模板。请勿在公开 Issue 中提交账号密码、Cookie、Session、付款凭证原图或其他个人信息。

欢迎提交可复核的数据修正与代码改进，详见 [贡献说明](CONTRIBUTING.md)。

## 许可证

项目代码使用 [MIT License](LICENSE)。第三方组件保留各自许可证，见 [第三方说明](THIRD_PARTY_NOTICES.md)。产品名称和商标属于各自权利人；外部价格资料的权利不由本代码许可证授予。
