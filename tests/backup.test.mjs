import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
const context = vm.createContext({
  Blob,
  document: { getElementById: () => ({ addEventListener() {} }) }
});
vm.runInContext(source.replace(/init\(\);\s*$/, ""), context);
vm.runInContext('materials = [{ id: "test-lesson", version: 1 }];', context);

function backup(overrides = {}) {
  return {
    schemaVersion: 1, materialId: "test-lesson", materialVersion: 1,
    phase: "compare", answer: "My translation", analysisSnapshot: "",
    messages: [], chatDraft: "", updatedAt: "2026-11-01T10:00:00.000Z",
    ...overrides
  };
}

test("long bilingual notes survive backup and local-state validation without truncation", () => {
  const raw = backup({ answer: "My translation and notes 笔记\n".repeat(600) });
  const restored = context.validateState(JSON.parse(JSON.stringify(raw)));
  assert.ok(raw.answer.length > 10000);
  assert.equal(restored.answer, raw.answer);
  assert.equal(context.validateState(restored).answer, raw.answer);
});

test("long answers preserve an existing AI snapshot and conversation", () => {
  const raw = backup({
    answer: "Notes 笔记\n".repeat(2000), analysisSnapshot: "My original answer",
    messages: [{ role: "assistant", content: "Feedback" }]
  });
  const restored = context.validateState(raw);
  assert.equal(restored.answer, raw.answer);
  assert.equal(restored.analysisSnapshot, raw.analysisSnapshot);
  assert.equal(restored.messages[0].content, "Feedback");
});

test("backup validation still rejects oversized data, mismatched materials and malformed fields", () => {
  assert.equal(context.validateState(backup({ answer: "字".repeat(400000) })), null);
  assert.equal(context.validateState(backup({ materialVersion: 2 })), null);
  assert.equal(context.validateState(backup({ answer: 123 })), null);
  assert.equal(context.validateState(backup({ messages: [{ role: "user", content: "Wrong order" }] })), null);
});
