import { writeFile } from "node:fs/promises";

const baseUrl = "https://nce.mymdm.top/nce3_";
const decode = (value) => value
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]*>/g, "")
  .replace(/&#x27;/gi, "'").replace(/&#39;/g, "'")
  .replace(/&quot;/gi, '"').replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
const paragraphs = (html) => [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)].map((match) => decode(match[1]));
const isEnglishPassage = (text) => {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return letters > 80 && letters / Math.max(text.length, 1) > 0.55 && !/First listen|美式发音|英式发音/i.test(text);
};
async function lesson(number) {
  const url = `${baseUrl}${String(number).padStart(2, "0")}/`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Lesson ${number}: HTTP ${response.status}`);
  const html = await response.text();
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? decode(titleMatch[1]) : `Lesson ${number}`;
  const contentMatch = html.match(/<div class="post-content[^"]*">([\s\S]*?)<\/div>\s*<\/article>/i);
  if (!contentMatch) throw new Error(`Lesson ${number}: content not found`);
  const content = contentMatch[1];
  const beforeWords = content.split(/<p><em><strong>New words and expressions/iu)[0];
  const english = paragraphs(beforeWords).filter(isEnglishPassage).join("\n\n").trim();
  const translationIndex = content.search(/参考译文/u);
  const afterTranslation = translationIndex < 0 ? "" : content.slice(translationIndex);
  const chinese = paragraphs(afterTranslation).filter((text) => (text.match(/[\u4e00-\u9fff]/g) || []).length > 30).join("\n\n").trim();
  if (!english || !chinese) throw new Error(`Lesson ${number}: missing ${!english ? "English" : "Chinese"} content`);
  return { id: `nce3-${String(number).padStart(2, "0")}`, version: 1, title, source: "新概念英语第三册", chinese, english };
}

const jobs = Array.from({ length: 60 }, (_, index) => index + 1);
const materials = [];
while (jobs.length) {
  const batch = jobs.splice(0, 6);
  const results = await Promise.all(batch.map(lesson));
  materials.push(...results);
  console.log(`Fetched lessons through ${batch.at(-1)}/60`);
}
materials.sort((a, b) => a.id.localeCompare(b.id));
await writeFile("materials.json", `${JSON.stringify(materials, null, 2)}\n`, "utf8");
console.log("Wrote 60 personal NCE3 materials.");
