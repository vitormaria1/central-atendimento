import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

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

function codeBlock(text) {
  const t = esc(text).trim();
  if (!t) return "";
  return `\n\n\`\`\`\n${t}\n\`\`\`\n`;
}

function topFindings({ scans, max = 20 }) {
  const out = [];
  for (const s of scans) {
    const lines = esc(s.stdout).trim();
    if (!lines) continue;
    const first = lines.split("\n").slice(0, Math.max(1, max)).join("\n");
    out.push({ title: s.title, lines: first, totalLines: lines.split("\n").length });
  }
  return out;
}

async function safeReadText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function buildRecommendations({ lintText, scans }) {
  const recs = [];

  const hasDangerHtml = scans.find((s) => s.id === "danger_html")?.stdout?.trim();
  if (hasDangerHtml) {
    recs.push({
      prio: "P0",
      title: "Revisar uso de dangerouslySetInnerHTML",
      why: "Risco de XSS se qualquer HTML vier de usuário/externo.",
      how: "Preferir renderização segura; se inevitável, sanitizar (ex.: DOMPurify) e documentar origem/ameaças.",
    });
  }

  const hasEval = scans.find((s) => s.id === "eval_like")?.stdout?.trim();
  if (hasEval) {
    recs.push({
      prio: "P0",
      title: "Remover padrões tipo eval/new Function",
      why: "Risco de execução arbitrária e vulnerabilidades.",
      how: "Substituir por parsers/whitelists; bloquear strings dinâmicas executáveis.",
    });
  }

  const missingDeps = lintText.includes("react-hooks/exhaustive-deps");
  if (missingDeps) {
    recs.push({
      prio: "P1",
      title: "Ajustar dependências de useEffect/useCallback",
      why: "Evita bugs intermitentes e closures desatualizadas.",
      how: "Extrair funções com useCallback/useMemo e incluir dependências corretamente (ou justificar com comentário).",
    });
  }

  const unusedDisables = lintText.includes("Unused eslint-disable directive");
  if (unusedDisables) {
    recs.push({
      prio: "P2",
      title: "Remover eslint-disable não utilizados",
      why: "Mantém o código limpo e evita suprimir alertas úteis.",
      how: "Apagar as linhas e deixar o lint apontar só o que importa.",
    });
  }

  const todos = scans.find((s) => s.id === "todos")?.stdout?.trim();
  if (todos) {
    recs.push({
      prio: "P2",
      title: "Revisar TODO/FIXME pendentes",
      why: "Reduz dívida técnica e inconsistências de comportamento.",
      how: "Converter em tarefas internas e atacar por prioridade.",
    });
  }

  // Always include a few product-quality suggestions for modern apps.
  recs.push(
    {
      prio: "P1",
      title: "Adicionar monitoramento e logging estruturado",
      why: "Acelera diagnóstico em produção (falha ao carregar/enviar).",
      how: "Logar erros críticos em rotas `/api/*` com request id + contexto; opcional: Sentry/Logflare.",
    },
    {
      prio: "P1",
      title: "Adicionar testes mínimos (smoke) nas rotas críticas",
      why: "Evita regressões em WhatsApp/chat/tarefas.",
      how: "Testes de API com `node:test` para endpoints e validações de schema.",
    },
    {
      prio: "P2",
      title: "Padronizar UI states (loading/empty/error) com componentes",
      why: "Consistência e acessibilidade.",
      how: "Criar componentes `EmptyState`, `ErrorState`, `Skeleton` e reutilizar.",
    },
  );

  return recs;
}

async function main() {
  const startedAt = new Date().toISOString();
  await mkdir("reports", { recursive: true });

  const head = await runCapture("git", ["rev-parse", "--short", "HEAD"]);
  const branch = await runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await runCapture("git", ["status", "--porcelain=v1"]);
  const diffStat = await runCapture("git", ["diff", "--stat"]);

  const lint = await runCapture("npm", ["run", "lint"]);
  const build = await runCapture("npm", ["run", "build"]);

  const scans = [
    { id: "todos", title: "TODO/FIXME", cmd: "rg", args: ["-n", "(TODO|FIXME)", "app", "lib", "scripts"] },
    { id: "console", title: "console.*", cmd: "rg", args: ["-n", "console\\.(log|debug|info|warn|error)", "app", "lib", "scripts"] },
    { id: "eslint_disable", title: "eslint-disable", cmd: "rg", args: ["-n", "eslint-disable", "app", "lib", "scripts"] },
    { id: "any", title: "TypeScript: any", cmd: "rg", args: ["-n", "\\bany\\b", "app", "lib", "scripts"] },
    { id: "danger_html", title: "dangerouslySetInnerHTML", cmd: "rg", args: ["-n", "dangerouslySetInnerHTML", "app", "lib"] },
    { id: "eval_like", title: "eval/new Function", cmd: "rg", args: ["-n", "\\beval\\(|new Function\\(", "app", "lib", "scripts"] },
  ];

  const scanResults = [];
  for (const s of scans) {
    // Keep it fast: ignore binary, hide errors if no matches.
    const res = await runCapture(s.cmd, [...s.args, "--no-messages"]);
    scanResults.push({ ...s, ...res });
  }

  const lintText = [lint.stdout, lint.stderr].filter(Boolean).join("\n");
  const buildText = [build.stdout, build.stderr].filter(Boolean).join("\n");

  const findings = topFindings({ scans: scanResults, max: 30 });
  const recs = buildRecommendations({ lintText, scans: scanResults });

  const md = [
    `# Revisão (Melhorias) — Agente Revisador`,
    ``,
    `- Data: ${startedAt}`,
    `- Branch: ${esc(branch.stdout).trim() || "?"}`,
    `- Commit: ${esc(head.stdout).trim() || "?"}`,
    ``,
    `## Resumo`,
    ``,
    `- Lint: ${lint.code === 0 ? "OK" : "FALHOU"} (exit ${lint.code})`,
    `- Build: ${build.code === 0 ? "OK" : "FALHOU"} (exit ${build.code})`,
    ``,
    `## Mudanças locais`,
    ``,
    `### git status`,
    codeBlock(status.stdout),
    `### git diff --stat`,
    codeBlock(diffStat.stdout),
    ``,
    `## Recomendações priorizadas`,
    ``,
    ...recs.map((r) => `- **${r.prio}** — ${r.title}\n  - Por quê: ${r.why}\n  - Como: ${r.how}`),
    ``,
    `## Achados (automáticos)`,
    ``,
    ...findings.map((f) => {
      const more = f.totalLines > 30 ? `\n\n_(Mostrando 30 de ${f.totalLines} linhas.)_\n` : "\n";
      return `### ${f.title}${more}${codeBlock(f.lines)}`;
    }),
    ``,
    `## Saída do Lint (eslint)`,
    codeBlock(lintText),
    ``,
    `## Saída do Build (next build)`,
    codeBlock(buildText),
  ].join("\n");

  const path = "reports/review-improve.md";
  await writeFile(path, md, "utf8");

  // eslint-disable-next-line no-console
  console.log(`Relatório gerado em: ${path}`);
  // eslint-disable-next-line no-console
  console.log(`Resumo: lint=${lint.code === 0 ? "OK" : "FALHOU"} • build=${build.code === 0 ? "OK" : "FALHOU"} • recs=${recs.length}`);

  // Exit non-zero if lint/build fails (useful for CI), but report is always generated.
  if (lint.code !== 0 || build.code !== 0) process.exit(1);
  process.exit(0);
}

await main();

