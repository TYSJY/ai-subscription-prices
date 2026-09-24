import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const configPath = existsSync("wrangler.jsonc") ? "wrangler.jsonc" : "wrangler.local.jsonc";
  return {
    server: { host: "127.0.0.1", port: 5173 },
    plugins: [
      vinext(),
      cloudflare({
        configPath,
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        persistState: { path: ".wrangler/state" },
        remoteBindings: false,
        inspectorPort: false,
      }),
    ],
  };
});
