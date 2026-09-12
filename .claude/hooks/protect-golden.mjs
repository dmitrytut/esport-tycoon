#!/usr/bin/env node
// Хук PreToolUse: запрещает агенту править golden и baseline.
//
// Правило из tests/README.md: «Если агент обновляет golden-файл, чтобы тест прошёл, —
// это дефект процесса, а не починка». До этого хука правило держалось только на
// pre-commit, то есть срабатывало уже после того, как агент увидел зелёный тест
// и отчитался о готовности. Теперь действие блокируется в момент попытки.
//
// Намеренный сдвиг остаётся возможным: golden перегенерируется отдельным коммитом
// с префиксом golden:/baseline: и объяснением механизма (.githooks/commit-msg).

const PROTECTED = /(^|\/)(tests?\/golden|sim\/baseline)\//;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  process.exit(0); // Не смогли разобрать вход — не наше дело блокировать.
}

const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
if (!PROTECTED.test(target.replaceAll("\\", "/"))) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Файл ${target} — зафиксированный снимок симуляции, вручную он не правится. ` +
        "Красный golden значит «симуляция поехала»: чини код, а не снимок. " +
        "Если сдвиг намеренный — перегенерируй файл и закоммить отдельно с префиксом " +
        "golden: или baseline: и объяснением, что именно в правилах сдвинуло цифры (tests/README.md).",
    },
  }),
);
