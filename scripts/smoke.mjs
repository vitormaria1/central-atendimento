import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...opts,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function listRouteFiles() {
  const out = [];
  const stack = ["app/api"];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) break;
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      if (e.isFile() && e.name === "route.ts") out.push(p);
    }
  }
  return out.sort();
}

function hasAnyMethodExport(src) {
  return /\bexport\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b/.test(src);
}

async function main() {
  const routeFiles = await listRouteFiles();
  if (!routeFiles.length) {
    console.error("Nenhuma rota encontrada em app/api/**/route.ts");
    process.exit(1);
  }

  let ok = true;
  for (const f of routeFiles) {
    const src = await readFile(f, "utf8");
    if (src.includes("export async function")) {
      ok = false;
      console.error(`❌ ${f}: ainda usa "export async function" (padronize com withApi + export const)`);
    }
    if (!hasAnyMethodExport(src)) {
      ok = false;
      console.error(`❌ ${f}: não encontrei export const GET/POST/PATCH/PUT/DELETE`);
    }
  }
  if (!ok) process.exit(1);

  // Also validate basic quality gates.
  const lint = await run("npm", ["run", "lint"]);
  if (lint !== 0) process.exit(lint);
  const build = await run("npm", ["run", "build"]);
  if (build !== 0) process.exit(build);

  console.log(`✅ Smoke OK (${routeFiles.length} rotas)`);
}

await main();
