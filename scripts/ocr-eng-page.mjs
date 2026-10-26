import { writeFile } from "node:fs/promises";
import { createWorker } from "tesseract.js";

const page = Number(process.argv[2]);
if (!Number.isInteger(page) || page < 1) throw new Error("Usage: node scripts/ocr-eng-page.mjs <pdfPage>");
const worker = await createWorker("eng");
try {
  const filename = `tmp/pdf-pages/page-${String(page).padStart(3, "0")}.jpg`;
  const result = await worker.recognize(filename);
  await writeFile(`tmp/ocr-page-${String(page).padStart(3, "0")}.txt`, result.data.text, "utf8");
  console.log(`OCR page ${page} complete`);
} finally { await worker.terminate(); }
