#!/usr/bin/env node
// Хук Stop: не даёт завершить ход, пока `pnpm verify` не зелёный.
//
// Плейбук AI-native SDLC: у сессии должен быть способ проверить свою работу до того,
// как её увидит человек. Гейт один и тот же для агента, pre-commit и CI.
//
// Запускается только если в рабочем дереве есть незакоммиченные изменения, которые
// гейт вообще может проверить: исходники, контент, конфиги тулчейна, артефакты спек.
// Ход, где агент ничего не менял, не платит четыре секунды.

import { execFileSync } from "node:child_process";

const RELEVANT =
  /\.(ts|mts)$|^content\/|^openspec\/|^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts|eslint\.config\.mjs)$/;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

// Claude Code уже продолжает ход из-за этого хука — второй раз не вмешиваемся.
if (input.stop_hook_active) process.exit(0);

const cwd = input.cwd || process.cwd();
const run = (file, args) => execFileSync(file, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let changed;
try {
  changed = run("git", ["status", "--porcelain"])
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((path) => path && RELEVANT.test(path));
} catch {
  process.exit(0); // Не git-каталог — проверять нечего.
}

if (changed.length === 0) process.exit(0);

try {
  run("pnpm", ["run", "verify"]);
  process.exit(0);
} catch (error) {
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trimEnd();
  const tail = output.split("\n").slice(-40).join("\n");
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "`pnpm verify` не проходит, работа не закончена. Чини код, а не проверку: " +
        "тесты не удалять, не пропускать и не ослаблять.\n\n" +
        tail,
    }),
  );
}
