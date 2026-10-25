const STORAGE_KEY = "backtranslation-practice/current/v1";
const SCHEMA_VERSION = 1;
const MAX_MESSAGES = 40;
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(["material-select", "material-title", "material-source", "save-status", "chinese-text", "chinese-compare-text", "english-text", "answer-input", "answer-preview", "practice-panel", "compare-panel", "compare-button", "back-to-edit-button", "analyze-button", "chat-log", "chat-form", "chat-input", "chat-send", "export-button", "import-button", "import-input", "reset-button", "confirm-dialog", "dialog-title", "dialog-message", "dialog-export", "dialog-confirm", "access-dialog", "access-form", "access-input", "access-cancel", "access-error", "version-note", "toast"].map((id) => [id, $(id)]));

let materials = [];
let state;
let accessCode = "";
let pendingAction = null;
let saveTimer;
let toastTimer;
let activeRequest = null;

function blankState(material) {
  return { schemaVersion: SCHEMA_VERSION, materialId: material.id, materialVersion: material.version, phase: "practice", answer: "", analysisSnapshot: "", messages: [], chatDraft: "", updatedAt: new Date().toISOString() };
}
function getMaterial(id = state?.materialId) { return materials.find((item) => item.id === id); }
function hasWork() { return Boolean(state.answer.trim() || state.messages.length || state.analysisSnapshot); }
function safeText(value, max = 10000) { return typeof value === "string" ? value.slice(0, max) : ""; }
function validateState(raw) {
  if (!raw || raw.schemaVersion !== SCHEMA_VERSION) return null;
  const material = materials.find((item) => item.id === raw.materialId && item.version === raw.materialVersion);
  if (!material || !["practice", "compare"].includes(raw.phase)) return null;
  const messages = Array.isArray(raw.messages) ? raw.messages.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-MAX_MESSAGES).map((m) => ({ role: m.role, content: safeText(m.content, 12000) })) : [];
  return { schemaVersion: SCHEMA_VERSION, materialId: material.id, materialVersion: material.version, phase: raw.phase, answer: safeText(raw.answer), analysisSnapshot: safeText(raw.analysisSnapshot), messages, chatDraft: safeText(raw.chatDraft, 2000), updatedAt: safeText(raw.updatedAt, 100) || new Date().toISOString() };
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
function render() {
  const material = getMaterial(); if (!material) return;
  els["material-select"].value = material.id;
  setText(els["material-title"], material.title); setText(els["material-source"], material.source);
  setText(els["chinese-text"], renderArticle(material.chinese)); setText(els["chinese-compare-text"], renderArticle(material.chinese)); setText(els["english-text"], renderArticle(material.english));
  if (els["answer-input"].value !== state.answer) els["answer-input"].value = state.answer;
  setText(els["answer-preview"], state.answer);
  const comparing = state.phase === "compare";
  els["practice-panel"].hidden = comparing; els["compare-panel"].hidden = !comparing;
  els["chat-input"].value = state.chatDraft;
  els["chat-form"].hidden = !state.messages.length;
  const needsReanalysis = Boolean(state.messages.length && state.analysisSnapshot !== state.answer);
  els["analyze-button"].hidden = Boolean(state.messages.length && !needsReanalysis);
  els["analyze-button"].textContent = needsReanalysis ? "重新分析" : "AI 分析";
  els["version-note"].hidden = !(state.analysisSnapshot && state.analysisSnapshot !== state.answer);
  if (!els["version-note"].hidden) els["version-note"].textContent = "你已修改答案；当前反馈基于修改前的版本。点击“重新分析”可开启新会话。";
  renderMessages();
}
function renderMessages() {
  els["chat-log"].replaceChildren();
  for (const message of state.messages) {
    const node = document.createElement("div"); node.className = `message ${message.role}`; node.textContent = message.content; els["chat-log"].append(node);
  }
}
function renderPending(label) { const node = document.createElement("div"); node.className = "message assistant pending"; node.id = "pending-message"; node.textContent = label; els["chat-log"].append(node); }
function removePending() { $("pending-message")?.remove(); }

function exportBackup() {
  const backup = { app: "backtranslation-practice", exportedAt: new Date().toISOString(), ...state };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `backtranslation-${state.materialId}-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); toast("已导出当前练习");
}
function openConfirm({ title, message, onConfirm }) {
  if (!hasWork()) return onConfirm(); pendingAction = onConfirm;
  els["dialog-title"].textContent = title; els["dialog-message"].textContent = message; els["confirm-dialog"].showModal();
}
els["confirm-dialog"].addEventListener("close", () => {
  const choice = els["confirm-dialog"].returnValue; const action = pendingAction; pendingAction = null;
  if (choice === "export") { exportBackup(); action?.(); }
  if (choice === "confirm") action?.();
});
function replaceState(next) { activeRequest?.abort(); activeRequest = null; state = next; saveNow(); render(); }
function changeMaterial(id) {
  const material = getMaterial(id); if (!material || material.id === state.materialId) return;
  openConfirm({ title: "切换文章？", message: "当前答案和 AI 会话会被替换。你可以先导出备份。", onConfirm: () => replaceState(blankState(material)) });
}
function resetCurrent() { openConfirm({ title: "重新练习本篇？", message: "当前答案和 AI 会话会被清除。你可以先导出备份。", onConfirm: () => replaceState(blankState(getMaterial())) }); }
function beginCompare() { state.answer = els["answer-input"].value; if (!state.answer.trim()) { toast("先写一点英文再对照吧"); els["answer-input"].focus(); return; } state.phase = "compare"; saveNow(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }

function apiUrl() { return window.BACKTRANSLATION_CONFIG?.apiUrl || ""; }
async function requestAI(payload) {
  if (!apiUrl()) throw new Error("not_configured");
  activeRequest?.abort(); activeRequest = new AbortController();
  const response = await fetch(apiUrl(), { method: "POST", headers: { "Content-Type": "application/json", "X-Backtranslation-Access": accessCode }, body: JSON.stringify(payload), signal: activeRequest.signal });
  let data = {}; try { data = await response.json(); } catch { /* use generic message */ }
  if (!response.ok) throw new Error(data.code || "upstream_error");
  if (!data.text || typeof data.text !== "string") throw new Error("upstream_error");
  return data.text;
}
function errorMessage(error) {
  const code = error?.message;
  return ({ not_configured: "AI 尚未配置。请在 config.js 填入后端地址。", unauthorized: "访问口令不正确。", invalid_input: "输入内容不符合要求。", material_mismatch: "文章版本不匹配，请刷新后再试。", rate_limited: "请求过于频繁，请稍后再试。", upstream_unavailable: "AI 服务暂时不可用，请稍后重试。", timeout: "请求超时，请稍后重试。", AbortError: "已取消当前请求。" })[code] || "分析没有完成，请稍后重试。";
}
function requestAccess(after) {
  if (accessCode) return after();
  els["access-error"].textContent = ""; els["access-input"].value = ""; els["access-dialog"].showModal();
  els["access-input"].focus();
  pendingAction = after;
}
async function analyze() {
  const run = async () => {
    const startingState = state;
    els["analyze-button"].disabled = true; renderPending("正在分析这篇回译…");
    try {
      const text = await requestAI({ action: "analyze", materialId: state.materialId, materialVersion: state.materialVersion, answer: state.answer });
      if (state !== startingState) return;
      state.analysisSnapshot = state.answer; state.messages = [{ role: "assistant", content: text }]; saveNow(); render();
    } catch (error) { removePending(); toast(errorMessage(error)); if (error?.message === "unauthorized") { accessCode = ""; } }
    finally { els["analyze-button"].disabled = false; activeRequest = null; }
  };
  if (!state.answer.trim()) return;
  const start = () => { if (state.messages.length) openConfirm({ title: "重新分析？", message: "当前 AI 会话会被新的分析替换。你可以先导出备份。", onConfirm: () => requestAccess(run) }); else requestAccess(run); };
  start();
}
async function sendChat(event) {
  event.preventDefault(); const startingState = state; const question = els["chat-input"].value.trim(); if (!question || !state.messages.length) return;
  const snapshot = state.analysisSnapshot; const priorMessages = state.messages.slice(-MAX_MESSAGES); state.messages.push({ role: "user", content: question }); state.chatDraft = ""; saveNow(); render(); renderPending("正在回答…"); els["chat-send"].disabled = true;
  try {
    const text = await requestAI({ action: "chat", materialId: state.materialId, materialVersion: state.materialVersion, answer: snapshot, messages: priorMessages, question });
    if (state !== startingState) return;
    state.messages.push({ role: "assistant", content: text }); state.messages = state.messages.slice(-MAX_MESSAGES); saveNow(); render();
  } catch (error) { state.messages.pop(); state.chatDraft = question; saveNow(); render(); toast(errorMessage(error)); if (error?.message === "unauthorized") { accessCode = ""; } }
  finally { removePending(); els["chat-send"].disabled = false; activeRequest = null; }
}
async function importBackup(file) {
  if (!file || file.size > 512 * 1024) return toast("备份文件无效或过大");
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
  els["compare-button"].addEventListener("click", beginCompare); els["back-to-edit-button"].addEventListener("click", () => { state.phase = "practice"; saveNow(); render(); });
  els["analyze-button"].addEventListener("click", analyze); els["chat-form"].addEventListener("submit", sendChat);
  els["export-button"].addEventListener("click", exportBackup); els["import-button"].addEventListener("click", () => els["import-input"].click()); els["import-input"].addEventListener("change", (event) => { importBackup(event.target.files[0]); event.target.value = ""; }); els["reset-button"].addEventListener("click", resetCurrent);
  els["access-form"].addEventListener("submit", (event) => { event.preventDefault(); accessCode = els["access-input"].value; if (!accessCode) return; const next = pendingAction; pendingAction = null; els["access-dialog"].close(); next?.(); });
  els["access-cancel"].addEventListener("click", () => { pendingAction = null; els["access-dialog"].close(); });
}
init();
