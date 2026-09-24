# 本地运行与部署

## 环境

- Node.js 22.13 或更高版本。
- pnpm 11.25.0；已安装 Node 后可运行 `npm install -g pnpm@11.25.0`。
- 本地开发使用 Cloudflare 的 D1 模拟数据库；无需登录。
- 生产运行需要自己的 Cloudflare Workers 与 D1。

## 本地运行

```bash
git clone https://github.com/TYSJY/ai-subscription-prices.git
cd ai-subscription-prices
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

浏览器打开 http://127.0.0.1:5173 。Windows PowerShell、macOS 与 Linux 均使用上述命令。初次初始化没有地区价格缓存，页面加载后会自动查询外部来源，也可点击更新；来源不可达时界面会显示失败或缺失。

本项目默认不需要 `.env` 或 AI API Key。`wrangler.local.jsonc` 中的数据库 ID 仅用于本机模拟，不是线上凭据。

## 验证与构建预览

```bash
pnpm test
pnpm build
pnpm start
```

构建预览地址以终端输出为准。源数据服务可能限流，不建议频繁发起全量查询。

## 部署到自己的 Cloudflare

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create ai-subscription-prices --config wrangler.local.jsonc
node -e "require('fs').copyFileSync('wrangler.example.jsonc','wrangler.jsonc')"
```

把创建命令返回的数据库 ID 填入 `wrangler.jsonc` 的 `database_id`；若使用其他数据库名，同时调整 `database_name`。需要时调整 Worker 的 `name`。保留绑定名 `DB`。自建站点上线前，将 `lib/site-info.ts` 中的 `SITE_URL` 及 `public/robots.txt`、`public/sitemap.xml` 中的站点地址改为自己的正式域名。

```bash
pnpm db:migrate:remote
pnpm run deploy
```

`pnpm run deploy` 会构建并上传 Worker 与静态资源；不会自动执行远程数据库迁移。首次部署和后续有数据库迁移的升级均需先执行对应迁移。实际服务费用与限额以你的 Cloudflare 账户为准。

`wrangler.jsonc`、`.wrangler/`、环境文件和数据库不应提交。项目自带忽略规则。缺少个人生产配置或尚未替换占位 ID 时，部署脚本会停止。

## GitHub 与在线站点

本项目包含服务端查询接口和 D1 数据库，因此不能把源码直接交给 GitHub Pages 运行。仓库的 Website 应指向已有在线查价站或你自己的完整部署地址。

GitHub 代码更新不会自动更新原 ChatGPT Sites 站点；两个部署需要各自发布。此公开副本没有原站点的项目关联、数据库内容或部署凭据。
