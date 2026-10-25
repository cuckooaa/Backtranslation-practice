import { readFile } from "node:fs/promises";

const materials = JSON.parse(await readFile("materials.json", "utf8"));
if (!Array.isArray(materials) || materials.length < 3) throw new Error("At least three materials are required.");
const ids = new Set();
for (const item of materials) {
  if (!item.id || ids.has(item.id) || !Number.isInteger(item.version) || !item.title || !item.source || !item.chinese || !item.english) {
    throw new Error(`Invalid material: ${item.id ?? "unknown"}`);
  }
  ids.add(item.id);
}
console.log(`Validated ${materials.length} materials.`);
