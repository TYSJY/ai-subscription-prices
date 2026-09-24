import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
process.env.WRANGLER_SEND_METRICS ??= "false";
process.env.WRANGLER_WRITE_LOGS ??= "false";
process.env.WRANGLER_LOG_PATH ??= path.join(root, ".wrangler/logs");
process.env.WRANGLER_REGISTRY_PATH ??= path.join(root, ".wrangler/dev-registry");
process.env.MINIFLARE_REGISTRY_PATH ??= path.join(root, ".wrangler/registry");
for (const dir of [process.env.WRANGLER_LOG_PATH, process.env.WRANGLER_REGISTRY_PATH, process.env.MINIFLARE_REGISTRY_PATH]) mkdirSync(dir, { recursive: true });

const [action, ...args] = process.argv.slice(2);
const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const vinext = path.join(root, "node_modules/vinext/dist/cli.js");
const vite = path.join(root, "node_modules/vite/bin/vite.js");
const config = existsSync("wrangler.jsonc") ? "wrangler.jsonc" : "wrangler.local.jsonc";
const builtConfig = "dist/server/wrangler.json";

function run(cli, cliArgs) {
  const result = spawnSync(process.execPath, [cli, ...cliArgs], { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function requireDeploymentConfig() {
  if (config !== "wrangler.jsonc") throw new Error("Copy wrangler.example.jsonc to wrangler.jsonc and set your own D1 database_id before using remote commands.");
  const text = readFileSync(config, "utf8");
  if (/REPLACE_WITH_YOUR_D1_DATABASE_ID|00000000-0000-4000-8000-000000000000/.test(text)) throw new Error("Replace the D1 database_id placeholder in wrangler.jsonc before using remote commands.");
}

switch (action) {
  case "dev":
    run(vite, ["--host", "127.0.0.1", "--port", "5173", ...args]);
    break;
  case "build":
    run(vinext, ["build", ...args]);
    break;
  case "start":
    if (!existsSync(builtConfig)) throw new Error("Run pnpm build first.");
    run(wrangler, ["dev", "--config", builtConfig, "--local", "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0", ...args]);
    break;
  case "migrate-local":
    run(wrangler, ["d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", ".wrangler/state", ...args]);
    break;
  case "migrate-remote":
    requireDeploymentConfig();
    run(wrangler, ["d1", "migrations", "apply", "DB", "--remote", "--config", config, ...args]);
    break;
  case "deploy":
    requireDeploymentConfig();
    run(vinext, ["build"]);
    run(wrangler, ["deploy", "--config", builtConfig, ...args]);
    break;
  default:
    throw new Error("Unknown task: " + action);
}
