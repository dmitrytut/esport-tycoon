#!/usr/bin/env node
// Хук SessionStart: кладёт бинари воркспейса в PATH сессии.
//
// Навыки /opsx:* вызывают `openspec` голой командой, но в pnpm-воркспейсе
// node_modules/.bin доступен только внутри `pnpm run` и `pnpm exec`. Ставить пакет
// глобально нельзя: рядом с закреплённой в devDependencies версией появится вторая,
// и они разъедутся. Вместо этого расширяем PATH ровно на время сессии.
//
// Путь берётся из cwd входного JSON, а не из CLAUDE_PROJECT_DIR: в worktree
// CLAUDE_PROJECT_DIR остаётся в основном checkout, а зависимости ставятся в сам worktree.

import { existsSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.env["CLAUDE_ENV_FILE"];
if (!envFile) process.exit(0);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let cwd = process.cwd();
try {
  cwd = JSON.parse(raw || "{}").cwd || cwd;
} catch {
  /* вход не разобрался — работаем от текущего каталога */
}

const bin = resolve(cwd, "node_modules/.bin");
if (!existsSync(bin)) process.exit(0); // Зависимости ещё не поставлены.

// Путь уходит в файл, который оболочка потом исполняет, поэтому одинарные кавычки
// с экранированием: каталог с кавычкой или бэктиком не должен превращаться в команду.
const quoted = `'${bin.replaceAll("'", "'\\''")}'`;
appendFileSync(envFile, `export PATH=${quoted}:"$PATH"\n`);
