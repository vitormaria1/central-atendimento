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

async function main() {
  const steps = [
    { name: "Lint (eslint)", cmd: "npm", args: ["run", "lint"] },
    { name: "Build (next build)", cmd: "npm", args: ["run", "build"] },
  ];

  let failed = false;
  for (const s of steps) {
    // eslint-disable-next-line no-console
    console.log(`\n=== Review Agent: ${s.name} ===\n`);
    const code = await run(s.cmd, s.args);
    if (code !== 0) {
      failed = true;
      // eslint-disable-next-line no-console
      console.error(`\n❌ Falhou: ${s.name} (exit ${code})\n`);
      break;
    }
    // eslint-disable-next-line no-console
    console.log(`\n✅ OK: ${s.name}\n`);
  }

  if (failed) process.exit(1);
  process.exit(0);
}

await main();

