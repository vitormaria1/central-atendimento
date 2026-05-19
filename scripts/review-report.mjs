import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

function runCapture(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      shell: process.platform === "win32",
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function esc(s) {
  return String(s ?? "").replaceAll("\r\n", "\n");
}

function formatCodeBlock(text) {
  const t = esc(text).trim();
  if (!t) return "";
  return `\n\n\`\`\`\n${t}\n\`\`\`\n`;
}

async function main() {
  const startedAt = new Date().toISOString();

  const head = await runCapture("git", ["rev-parse", "--short", "HEAD"]);
  const branch = await runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await runCapture("git", ["status", "--porcelain=v1"]);
  const diffStat = await runCapture("git", ["diff", "--stat"]);

  const lint = await runCapture("npm", ["run", "lint"]);
  const build = await runCapture("npm", ["run", "build"]);

  const okLint = lint.code === 0;
  const okBuild = build.code === 0;

  const md = [
    `# Relatório do Agente Revisador`,
    ``,
    `- Data: ${startedAt}`,
    `- Branch: ${esc(branch.stdout).trim() || "?"}`,
    `- Commit: ${esc(head.stdout).trim() || "?"}`,
    ``,
    `## Resumo`,
    ``,
    `- Lint: ${okLint ? "OK" : "FALHOU"} (exit ${lint.code})`,
    `- Build: ${okBuild ? "OK" : "FALHOU"} (exit ${build.code})`,
    ``,
    `## Mudanças locais`,
    ``,
    `### git status`,
    formatCodeBlock(status.stdout),
    `### git diff --stat`,
    formatCodeBlock(diffStat.stdout),
    ``,
    `## Lint (eslint)`,
    formatCodeBlock([lint.stdout, lint.stderr].filter(Boolean).join("\n")),
    ``,
    `## Build (next build)`,
    formatCodeBlock([build.stdout, build.stderr].filter(Boolean).join("\n")),
  ].join("\n");

  await mkdir("reports", { recursive: true });
  const path = "reports/review-report.md";
  await writeFile(path, md, "utf8");

  // Keep stdout short and actionable.
  // eslint-disable-next-line no-console
  console.log(`Relatório gerado em: ${path}`);
  // eslint-disable-next-line no-console
  console.log(`Resumo: lint=${okLint ? "OK" : "FALHOU"} • build=${okBuild ? "OK" : "FALHOU"}`);

  if (!okLint || !okBuild) process.exit(1);
  process.exit(0);
}

await main();

