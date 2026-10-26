import { mkdir, readFile, writeFile } from "node:fs/promises";

const materials = JSON.parse(await readFile("materials.json", "utf8"));
await mkdir("dist", { recursive: true });
await mkdir("worker/src", { recursive: true });

await writeFile("dist/materials.json", `${JSON.stringify(materials, null, 2)}\n`, "utf8");
const manifest = materials.map(({ id, version, chinese, english }) => ({ id, version, chinese, english }));
await writeFile("worker/src/materials.generated.js", `// Generated from materials.json. Do not edit directly.\nexport default ${JSON.stringify(manifest, null, 2)};\n`, "utf8");
console.log(`Synced ${materials.length} materials.`);
