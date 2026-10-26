import { readFile, writeFile } from "node:fs/promises";
import { createWorker } from "tesseract.js";

const imageDirectory = "tmp/pdf-pages";
const firstLesson = Number(process.argv[2] || 1);
const lastLesson = Number(process.argv[3] || 60);
if (!Number.isInteger(firstLesson) || !Number.isInteger(lastLesson) || firstLesson < 1 || lastLesson > 60 || firstLesson > lastLesson) throw new Error("Usage: node scripts/ocr-lessons.mjs [firstLesson] [lastLesson]");
const englishWorker = await createWorker("eng");
const chineseWorker = await createWorker("chi_sim");
const lessons = [];

try {
  for (let lesson = firstLesson; lesson <= lastLesson; lesson += 1) {
    const englishPage = 16 + (lesson - 1) * 4;
    const chinesePage = englishPage + 1;
    const pageName = (page) => `${imageDirectory}/page-${String(page).padStart(3, "0")}.jpg`;
    const [english, chinese] = await Promise.all([
      englishWorker.recognize(pageName(englishPage)),
      chineseWorker.recognize(pageName(chinesePage))
    ]);
    lessons.push({ lesson, englishPage, chinesePage, englishOcr: english.data.text, chineseOcr: chinese.data.text });
    console.log(`OCR ${lesson}/60 (PDF pages ${englishPage}-${chinesePage})`);
  }
  await writeFile(`tmp/ocr-lessons-${firstLesson}-${lastLesson}.json`, JSON.stringify(lessons, null, 2), "utf8");
} finally {
  await englishWorker.terminate();
  await chineseWorker.terminate();
}
