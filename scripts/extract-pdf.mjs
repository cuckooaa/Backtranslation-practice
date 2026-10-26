import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const input = process.argv[2] || "新概念英语 第三册 (路易·亚历山大).pdf";
const output = process.argv[3] || "tmp/extracted-pdf.json";
const bytes = new Uint8Array(await readFile(input));
const pdf = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise;
const pages = [];
for (let number = 1; number <= pdf.numPages; number += 1) {
  const page = await pdf.getPage(number);
  const content = await page.getTextContent();
  const items = content.items.map((item) => ({ text: item.str, x: Math.round(item.transform[4]), y: Math.round(item.transform[5]), width: Math.round(item.width) }));
  pages.push({ number, items });
  if (number % 25 === 0) process.stdout.write(`Extracted ${number}/${pdf.numPages} pages\n`);
}
await mkdir("tmp", { recursive: true });
await writeFile(output, JSON.stringify({ pages }, null, 2), "utf8");
console.log(`Wrote ${pdf.numPages} pages to ${output}`);
