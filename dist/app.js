const STORAGE_KEY = "backtranslation-practice/current/v1";
const RECOVERY_KEY = "backtranslation-practice/recovery/v1";
const SCHEMA_VERSION = 1;
const MAX_FOLLOW_UPS = 20;
const MAX_MESSAGES = 1 + MAX_FOLLOW_UPS * 2;
const MAX_BACKUP_BYTES = 1024 * 1024;
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(["material-select", "material-title", "material-source", "save-status", "source-label", "chinese-text", "answer-input", "practice-panel", "compare-panel", "compare-button", "analyze-button", "ai-dialog", "reanalyze-button", "chat-log", "chat-form", "chat-input", "chat-send", "export-button", "import-button", "import-input", "reset-button", "confirm-dialog", "dialog-title", "dialog-message", "dialog-export", "dialog-confirm", "access-dialog", "access-form", "access-input", "access-cancel", "version-note", "snapshot-button", "snapshot-text", "toast"].map((id) => [id, $(id)]));

let materials = [];
let state;
let accessCode = "";
let pendingConfirm = null;
let pendingAccess = null;
let saveTimer;
let toastTimer;
let activeRequest = null;
let requestSerial = 0;
let streamingText = "";

function blankState(material) {
  return { schemaVersion: SCHEMA_VERSION, materialId: material.id, materialVersion: material.version, phase: "practice", answer: "", analysisSnapshot: "", messages: [], chatDraft: "", updatedAt: new Date().toISOString() };
}
function getMaterial(id = state?.materialId) { return materials.find((item) => item.id === id); }
function hasWork() { return Boolean(state.answer.trim() || state.messages.length || state.analysisSnapshot); }
function safeText(value, max = 10000) { return typeof value === "string" && value.length <= max ? value : null; }
function validateState(raw) {
  if (!raw || raw.schemaVersion !== SCHEMA_VERSION) return null;
  const material = materials.find((item) => item.id === raw.materialId && item.version === raw.materialVersion);
  if (!material || !["practice", "compare"].includes(raw.phase)) return null;
  if (!Array.isArray(raw.messages) || raw.messages.length > MAX_MESSAGES) return null;
  const messages = raw.messages.map((m, index) => {
    if (!m || m.role !== (index % 2 === 0 ? "assistant" : "user") || !safeText(m.content, 12000)) return null;
    return { role: m.role, content: m.content };
  });
  const answer = safeText(raw.answer); const analysisSnapshot = safeText(raw.analysisSnapshot); const chatDraft = safeText(raw.chatDraft, 2000); const updatedAt = safeText(raw.updatedAt, 100);
  if (messages.includes(null) || answer === null || analysisSnapshot === null || chatDraft === null || updatedAt === null || (!messages.length && analysisSnapshot) || (messages.length && !analysisSnapshot) || new Blob([JSON.stringify(raw)]).size > MAX_BACKUP_BYTES) return null;
  return { schemaVersion: SCHEMA_VERSION, materialId: material.id, materialVersion: material.version, phase: raw.phase, answer, analysisSnapshot, messages, chatDraft, updatedAt };
}
function setSaveStatus(text) { els["save-status"].textContent = text; }
function saveNow() {
  state.updatedAt = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setSaveStatus("已保存到本机"); }
  catch { setSaveStatus("本机保存不可用，请及时导出"); }
}
function scheduleSave() { setSaveStatus("正在保存…"); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); }
function toast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600); }
function setText(el, value) { el.textContent = value || "—"; }
function renderArticle(text) { return text; }
function escapeHtml(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function renderInlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>").replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");
  return html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function renderMarkdown(value) {
  const lines = value.replace(/\r/g, "").split("\n"); let html = ""; let paragraph = []; let list = null; let codeLines = []; let inCode = false;
  const flushParagraph = () => { if (paragraph.length) { html += `<p>${renderInlineMarkdown(paragraph.join("\n")).replaceAll("\n", "<br>")}</p>`; paragraph = []; } };
  const flushList = () => { if (list) { html += `<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${list.type}>`; list = null; } };
  const flushCode = () => { html += `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`; codeLines = []; };
  for (const line of lines) {
    if (line.startsWith("```")) { flushParagraph(); flushList(); if (inCode) flushCode(); inCode = !inCode; continue; }
    if (inCode) { codeLines.push(line); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const unordered = line.match(/^[-*+]\s+(.+)$/); const ordered = line.match(/^\d+[.)]\s+(.+)$/); const quote = line.match(/^>\s?(.*)$/);
    if (heading) { flushParagraph(); flushList(); const level = heading[1].length; html += `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`; }
    else if (quote) { flushParagraph(); flushList(); html += `<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`; }
    else if (unordered || ordered) { flushParagraph(); const type = unordered ? "ul" : "ol"; if (!list || list.type !== type) { flushList(); list = { type, items: [] }; } list.items.push((unordered || ordered)[1]); }
    else { flushList(); paragraph.push(line); }
  }
  if (inCode) flushCode(); flushParagraph(); flushList(); return html;
}
function appendMarkdownMessage(node, content) { const rendered = document.createElement("div"); rendered.className = "markdown"; rendered.innerHTML = renderMarkdown(content); node.append(rendered); }
function render() {
  const material = getMaterial(); if (!material) return;
  els["material-select"].value = material.id;
  setText(els["material-title"], material.title); setText(els["material-source"], material.source);
  const comparing = state.phase === "compare";
  setText(els["chinese-text"], renderArticle(comparing ? material.english : material.chinese));
  els["source-label"].textContent = comparing ? "参考原文" : "中文";
  if (els["answer-input"].value !== state.answer) els["answer-input"].value = state.answer;
  els["answer-input"].readOnly = comparing;
  els["answer-input"].setAttribute("aria-readonly", String(comparing));
  els["compare-button"].textContent = comparing ? "继续修改" : "完成并对照";
  els["compare-panel"].hidden = !comparing;
  els["chat-input"].value = state.chatDraft;
  els["chat-form"].hidden = !state.messages.length;
  const needsReanalysis = Boolean(state.messages.length && state.analysisSnapshot !== state.answer);
  const reachedLimit = state.messages.filter((message) => message.role === "user").length >= MAX_FOLLOW_UPS;
  els["analyze-button"].hidden = false;
  els["analyze-button"].textContent = "AI 分析";
  els["reanalyze-button"].hidden = !(state.messages.length && (needsReanalysis || reachedLimit));
  els["version-note"].hidden = !(state.analysisSnapshot && state.analysisSnapshot !== state.answer);
  if (!els["version-note"].hidden) els["version-note"].textContent = "你已修改答案；当前反馈基于修改前的版本。点击“重新分析”可开启新会话。";
  els["snapshot-button"].hidden = !state.analysisSnapshot;
  els["snapshot-text"].hidden = true;
  renderMessages();
}
function renderMessages() {
  els["chat-log"].replaceChildren();
  for (const message of state.messages) {
    const node = document.createElement("div"); node.className = `message ${message.role}`;
    if (message.role === "assistant") appendMarkdownMessage(node, message.content); else node.textContent = message.content;
    els["chat-log"].append(node);
  }
  if (activeRequest) {
    const node = document.createElement("div"); node.className = "message assistant pending";
    if (streamingText) appendMarkdownMessage(node, streamingText); else node.textContent = "正在生成…";
    els["chat-log"].append(node);
    els["chat-log"].scrollTop = els["chat-log"].scrollHeight;
  }
}

function exportBackup() {
  const backup = { app: "backtranslation-practice", exportedAt: new Date().toISOString(), ...state };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `backtranslation-${state.materialId}-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); toast("已导出当前练习");
}
function openConfirm({ title, message, onConfirm, onCancel }) {
  if (!hasWork()) return onConfirm(); pendingConfirm = { onConfirm, onCancel };
  els["dialog-title"].textContent = title; els["dialog-message"].textContent = message; els["confirm-dialog"].showModal();
}
els["confirm-dialog"].addEventListener("close", () => {
  const choice = els["confirm-dialog"].returnValue; const action = pendingConfirm; pendingConfirm = null;
  if (choice === "export") { exportBackup(); action?.onConfirm?.(); }
  else if (choice === "confirm") action?.onConfirm?.();
  else action?.onCancel?.();
});
function closeAiDialog() { if (els["ai-dialog"].open) els["ai-dialog"].close(); }
function toggleAiDialog() {
  if (els["ai-dialog"].open) return;
  els["ai-dialog"].showModal(); render();
  if (!state.messages.length) analyze();
  else els["chat-input"].focus();
}
function replaceState(next) { requestSerial += 1; activeRequest?.abort(); activeRequest = null; closeAiDialog(); state = next; saveNow(); render(); }
function changeMaterial(id) {
  const material = getMaterial(id); if (!material || material.id === state.materialId) return;
  openConfirm({ title: "切换文章？", message: "当前答案和 AI 会话会被替换。你可以先导出备份。", onConfirm: () => replaceState(blankState(material)), onCancel: () => { els["material-select"].value = state.materialId; } });
}
function resetCurrent() { openConfirm({ title: "重新练习本篇？", message: "当前答案和 AI 会话会被清除。你可以先导出备份。", onConfirm: () => replaceState(blankState(getMaterial())) }); }
function toggleCompare() {
  if (state.phase === "compare") { closeAiDialog(); state.phase = "practice"; saveNow(); render(); els["answer-input"].focus(); return; }
  state.answer = els["answer-input"].value;
  if (!state.answer.trim()) { toast("先写一点英文再对照吧"); els["answer-input"].focus(); return; }
  state.phase = "compare"; saveNow(); render();
}

function apiUrl() { return window.BACKTRANSLATION_CONFIG?.apiUrl || ""; }
async function readStream(response, onToken) {
  const reader = response.body?.getReader(); if (!reader) throw new Error("upstream_error");
  const decoder = new TextDecoder(); let buffer = ""; let answer = ""; let finished = false; let failure = "";
  const consume = (frame) => {
    const lines = frame.replace(/\r/g, "").split("\n"); const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n"); if (!data) return;
    let value; try { value = JSON.parse(data); } catch { throw new Error("upstream_error"); }
    if (event === "token") { if (typeof value.text !== "string" || !value.text) throw new Error("upstream_error"); answer += value.text; if (answer.length > 12000) throw new Error("upstream_error"); onToken(value.text); }
    else if (event === "done") finished = true;
    else if (event === "error") failure = value.code || "upstream_error";
  };
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); let separator;
    while ((separator = buffer.indexOf("\n\n")) >= 0) { consume(buffer.slice(0, separator)); buffer = buffer.slice(separator + 2); }
  }
  if (failure) { const error = new Error(failure); error.partial = answer; throw error; }
  if (!finished || !answer) { const error = new Error("upstream_error"); error.partial = answer; throw error; }
  return answer;
}
async function requestAI(payload, onToken) {
  if (!apiUrl()) throw new Error("not_configured");
  if (activeRequest) throw new Error("request_in_progress");
  activeRequest = new AbortController();
  streamingText = ""; renderMessages();
  const response = await fetch(apiUrl(), { method: "POST", headers: { "Content-Type": "application/json", "X-Backtranslation-Access": accessCode }, body: JSON.stringify(payload), signal: activeRequest.signal });
  if (!response.ok) { let data = {}; try { data = await response.json(); } catch { /* generic error below */ } throw new Error(data.code || "upstream_error"); }
  if (!response.headers.get("Content-Type")?.includes("text/event-stream")) throw new Error("upstream_error");
  return readStream(response, onToken);
}
function errorMessage(error) {
  const code = error?.message;
  return ({ not_configured: "AI 尚未配置。请在 config.js 填入后端地址。", unauthorized: "访问口令不正确。", origin_not_allowed: "当前网页地址不在 AI 服务的允许列表中。", invalid_input: "输入内容不符合要求。", material_mismatch: "文章版本不匹配，请刷新后再试。", payload_too_large: "本次会话内容过长，请导出后重新分析。", rate_limited: "请求过于频繁，请稍后再试。", ai_disabled: "AI 功能暂时关闭。", upstream_unavailable: "AI 服务暂时不可用，请稍后重试。", timeout: "请求超时，请稍后重试。", AbortError: "已取消当前请求。" })[code] || "分析没有完成，请稍后重试。";
}
function requestAccess(after) {
  if (!apiUrl()) { toast("AI 尚未配置。请在 config.js 填入后端地址。"); return; }
  if (accessCode) return after();
  els["access-input"].value = ""; els["access-dialog"].showModal();
  els["access-input"].focus();
  pendingAccess = after;
}
els["access-dialog"].addEventListener("close", () => { pendingAccess = null; });
function analyze() {
  const run = async () => {
    const startingState = state; const serial = ++requestSerial;
    const snapshot = { materialId: state.materialId, materialVersion: state.materialVersion, answer: state.answer };
    els["analyze-button"].disabled = true;
    try {
      const text = await requestAI({ action: "analyze", ...snapshot }, (chunk) => { streamingText += chunk; renderMessages(); });
      if (state !== startingState || serial !== requestSerial) return;
      state.analysisSnapshot = snapshot.answer; state.messages = [{ role: "assistant", content: text }]; state.chatDraft = ""; saveNow(); render();
    } catch (error) {
      if (state !== startingState || serial !== requestSerial) return;
      if (error?.partial) { state.analysisSnapshot = snapshot.answer; state.messages = [{ role: "assistant", content: error.partial }]; state.chatDraft = ""; saveNow(); toast("生成中断，已保留已生成内容。"); }
      else toast(errorMessage(error));
      if (error?.message === "unauthorized") accessCode = "";
    } finally { if (serial === requestSerial) { activeRequest = null; streamingText = ""; els["analyze-button"].disabled = false; render(); } }
  };
  if (!state.answer.trim()) return toast("先写一点英文再分析吧");
  const start = () => requestAccess(run);
  if (state.messages.length) openConfirm({ title: "重新分析？", message: "当前 AI 会话会在新的分析成功后替换。你可以先导出备份。", onConfirm: start }); else start();
}
function sendChat(event) {
  event.preventDefault(); const question = els["chat-input"].value.trim(); if (!question || !state.messages.length || activeRequest) return;
  if (state.messages.filter((message) => message.role === "user").length >= MAX_FOLLOW_UPS) return toast("本次会话已达到 20 次追问。可以重新分析开启新会话。");
  requestAccess(async () => {
    const startingState = state; const serial = ++requestSerial; const snapshot = state.analysisSnapshot; const priorMessages = state.messages.map((message) => ({ ...message })); els["chat-send"].disabled = true;
    try {
      const text = await requestAI({ action: "chat", materialId: state.materialId, materialVersion: state.materialVersion, answer: snapshot, messages: priorMessages, question }, (chunk) => { streamingText += chunk; renderMessages(); });
      if (state !== startingState || serial !== requestSerial) return;
      state.messages.push({ role: "user", content: question }, { role: "assistant", content: text }); state.chatDraft = ""; saveNow(); render();
    } catch (error) {
      if (state !== startingState || serial !== requestSerial) return;
      if (error?.partial) { state.messages.push({ role: "user", content: question }, { role: "assistant", content: error.partial }); state.chatDraft = ""; saveNow(); toast("生成中断，已保留已生成内容。"); }
      else { state.chatDraft = question; saveNow(); toast(errorMessage(error)); }
      if (error?.message === "unauthorized") accessCode = "";
    } finally { if (serial === requestSerial) { els["chat-send"].disabled = false; activeRequest = null; streamingText = ""; render(); } }
  });
}
async function importBackup(file) {
  if (!file || file.size > MAX_BACKUP_BYTES) return toast("备份文件无效或过大");
  try {
    const raw = JSON.parse(await file.text()); const restored = validateState(raw);
    if (!restored) throw new Error();
    openConfirm({ title: "恢复这份备份？", message: "当前答案和 AI 会话会被替换。你可以先导出备份。", onConfirm: () => { replaceState(restored); toast("已恢复备份"); } });
  } catch { toast("无法恢复这份备份，请确认它来自本网站且文章版本匹配"); }
}

async function init() {
  try { materials = await fetch("./materials.json", { cache: "no-store" }).then((res) => { if (!res.ok) throw new Error(); return res.json(); }); }
  catch { document.body.innerHTML = "<p style='padding:2rem'>材料加载失败。请确认 materials.json 已随网站发布。</p>"; return; }
  els["material-select"].replaceChildren(...materials.map((item) => { const option = document.createElement("option"); option.value = item.id; option.textContent = item.title; return option; }));
  try { state = validateState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { state = null; }
  state ??= blankState(materials[0]); render(); saveNow();
  els["material-select"].addEventListener("change", (event) => changeMaterial(event.target.value));
  els["answer-input"].addEventListener("input", (event) => { state.answer = event.target.value; scheduleSave(); });
  els["chat-input"].addEventListener("input", (event) => { state.chatDraft = event.target.value; scheduleSave(); });
  els["chat-input"].addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); els["chat-form"].requestSubmit(); } });
  els["compare-button"].addEventListener("click", toggleCompare);
  els["analyze-button"].addEventListener("click", toggleAiDialog); els["reanalyze-button"].addEventListener("click", analyze); els["chat-form"].addEventListener("submit", sendChat);
  els["ai-dialog"].addEventListener("click", (event) => {
    if (event.target !== els["ai-dialog"]) return;
    const rect = els["ai-dialog"].getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeAiDialog();
  });
  els["ai-dialog"].addEventListener("close", render);
  els["export-button"].addEventListener("click", exportBackup); els["import-button"].addEventListener("click", () => els["import-input"].click()); els["import-input"].addEventListener("change", (event) => { importBackup(event.target.files[0]); event.target.value = ""; }); els["reset-button"].addEventListener("click", resetCurrent);
  els["snapshot-button"].addEventListener("click", () => { const hidden = els["snapshot-text"].hidden; els["snapshot-text"].hidden = !hidden; els["snapshot-button"].textContent = hidden ? "收起分析答案" : "查看分析时的答案"; if (hidden) els["snapshot-text"].textContent = state.analysisSnapshot; });
  els["access-form"].addEventListener("submit", (event) => { event.preventDefault(); accessCode = els["access-input"].value; if (!accessCode) return; const next = pendingAccess; pendingAccess = null; els["access-dialog"].close(); next?.(); });
  els["access-cancel"].addEventListener("click", () => els["access-dialog"].close());
}
init();
