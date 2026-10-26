import { writeFile } from "node:fs/promises";
import { createWorker } from "tesseract.js";

const worker = await createWorker("eng");
const pages = [];
const firstLesson = Number(process.argv[2] || 41);
const lastLesson = Number(process.argv[3] || 60);
if (!Number.isInteger(firstLesson) || !Number.isInteger(lastLesson) || firstLesson < 41 || lastLesson > 60 || firstLesson > lastLesson) throw new Error("Usage: node scripts/ocr-unit3-pages.mjs [firstLesson] [lastLesson]");
try {
  for (let lesson = firstLesson; lesson <= lastLesson; lesson += 1) {
    const startPage = 194 + (lesson - 41) * 4;
    const names = [startPage, startPage + 1].map((page) => `tmp/pdf-pages/page-${String(page).padStart(3, "0")}.jpg`);
    const results = await Promise.all(names.map((name) => worker.recognize(name)));
    pages.push({ lesson, startPage, pages: results.map((result) => result.data.text) });
    console.log(`OCR Unit 3 Lesson ${lesson}/60`);
  }
  await writeFile(`tmp/ocr-unit3-${firstLesson}-${lastLesson}.json`, JSON.stringify(pages, null, 2), "utf8");
} finally { await worker.terminate(); }
