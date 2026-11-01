const pagePrefix = location.pathname.includes("/pages/") ? "./" : "./pages/";
const navItems = [
  ["Главная", location.pathname.includes("/pages/") ? "../index.html" : "./index.html"],
  ["Предметы", pagePrefix + "subjects.html"],
  ["AI-чат", pagePrefix + "chat.html"],
  ["Фотоанализ", pagePrefix + "image-analysis.html"],
  ["Модели", pagePrefix + "models.html"],
  ["Библиотека", pagePrefix + "library.html"]
];
const header = document.querySelector("#site-header");
if (header) header.innerHTML = `<header class="topbar"><a class="brand" href="${navItems[0][1]}"><span class="brand-mark">A<span>+</span></span><span><strong>AI SCHOOL</strong><small>ASSISTANT · 5–11 КЛАССЫ</small></span></a><nav class="main-nav">${navItems.slice(1).map(([label,url]) => `<a href="${url}">${label}</a>`).join("")}</nav><a class="top-cta" href="${pagePrefix}chat.html">Начать учиться ↗</a></header>`;
const footer = document.querySelector("#site-footer");
if (footer) footer.innerHTML = `<footer class="footer"><a class="brand" href="${navItems[0][1]}"><span class="brand-mark">A<span>+</span></span><span><strong>AI SCHOOL</strong><small>ASSISTANT</small></span></a><p>Учись с пониманием. Шаг за шагом.</p><a href="${pagePrefix}settings.html">Настройки</a></footer>`;

const API = "/api";
const $ = (selector) => document.querySelector(selector);
async function api(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка сервера (${response.status})`);
  return data;
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function renderText(text) {
  return escapeHtml(text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}
const HISTORY_KEY = "ai-school-chat-history-v1";
function getHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-40) : [];
  } catch { return []; }
}
function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40))); }
  catch { /* Storage can be disabled or full; the current chat still works in memory. */ }
}

async function loadModels() {
  try {
    const data = await api("/models");
    return data.models || [];
  } catch (error) {
    console.warn(error);
    return [];
  }
}
function modelLabel(model) {
  const price = model.free ? " · free tier" : "";
  return model.name + (model.vision ? " · vision" : "") + price;
}
function fillSelect(select, models, preferred) {
  if (!select) return;
  const list = models.filter((m) => !select.dataset.vision || m.vision);
  select.innerHTML = list.length ? list.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(modelLabel(m))}</option>`).join("") : '<option value="">Модели недоступны</option>';
  if (preferred && list.some((m) => m.id === preferred)) select.value = preferred;
}

const chatForm = $("#chat-form");
if (chatForm) {
  const messagesEl = $("#chat-messages");
  const input = $("#chat-input");
  const status = $("#chat-status");
  const modelSelect = $("#chat-model");
  let history = getHistory();
  let models = [];
  let sending = false;
  const sendButton = chatForm.querySelector("button[type=submit]");
  function drawHistory() {
    messagesEl.innerHTML = history.length ? history.map((m) => `<div class="message ${m.role === "assistant" ? "assistant" : "user"}"><b>${m.role === "assistant" ? "AI School" : "Ты"}</b><p>${renderText(m.content)}</p></div>`).join("") : '<div class="message assistant"><b>AI School</b><p>Привет! Напиши вопрос по школьной теме.</p></div>';
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  drawHistory();
  const preferredChatModel = sessionStorage.getItem("ai-school-selected-model");
  loadModels().then((loaded) => {
    models = loaded;
    fillSelect(modelSelect, models, preferredChatModel);
    sessionStorage.removeItem("ai-school-selected-model");
    if (!models.length) status.textContent = "Каталог моделей пока недоступен.";
  });
  const params = new URLSearchParams(location.search);
  const subject = params.get("subject");
  if (subject) input.value = `Помоги мне с предметом «${subject}». Объясни тему простым языком.`;
  $("#clear-chat")?.addEventListener("click", () => { history = []; saveHistory(history); drawHistory(); status.textContent = "История очищена."; });
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const text = input.value.trim();
    if (!text) return;
    const model = modelSelect.value;
    if (!model) { status.textContent = "Сначала дождись загрузки моделей."; return; }
    sending = true; sendButton.disabled = true; input.disabled = true;
    history.push({ role: "user", content: text });
    drawHistory(); saveHistory(history); input.value = ""; status.textContent = "AI готовит объяснение…";
    const pending = document.createElement("div");
    pending.className = "message assistant"; pending.innerHTML = "<b>AI School</b><p>Думаю…</p>"; messagesEl.append(pending); messagesEl.scrollTop = messagesEl.scrollHeight;
    try {
      const result = await api("/chat", { method: "POST", body: JSON.stringify({ model, grade: $("#chat-grade").value, messages: history.slice(-12) }) });
      history.push({ role: "assistant", content: result.answer || "Не удалось получить текстовый ответ." });
      saveHistory(history); drawHistory(); status.textContent = `Ответ от ${result.model || model}`;
    } catch (error) {
      pending.remove();
      history.pop(); saveHistory(history); drawHistory();
      status.textContent = error.message;
    } finally {
      sending = false; sendButton.disabled = false; input.disabled = false; input.focus();
    }
  });
}

const fileInput = $("#image-file");
if (fileInput) {
  const preview = $("#image-preview"), button = $("#analyze-image"), status = $("#image-status"), resultBox = $("#image-result"), modelSelect = $("#vision-model");
  modelSelect.dataset.vision = "true";
  let selectedFile = null, dataUrl = "";
  loadModels().then((models) => { fillSelect(modelSelect, models.filter(m => m.vision)); if (!models.some(m => m.vision)) status.textContent = "Не удалось загрузить список vision-моделей."; });
  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files?.[0] || null;
    dataUrl = ""; button.disabled = true; preview.hidden = true;
    if (!selectedFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type) || selectedFile.size > 8 * 1024 * 1024) {
      status.textContent = "Выбери JPG, PNG или WEBP размером до 8 МБ."; fileInput.value = ""; selectedFile = null; button.disabled = true; preview.hidden = true; return;
    }
    const currentFile = selectedFile;
    const reader = new FileReader();
    reader.onload = () => {
      if (selectedFile !== currentFile) return;
      dataUrl = String(reader.result); preview.src = dataUrl; preview.hidden = false; button.disabled = false; status.textContent = `Выбрано: ${selectedFile.name}`;
    };
    reader.onerror = () => { if (selectedFile === currentFile) status.textContent = "Не удалось прочитать файл. Попробуй другое изображение."; };
    reader.readAsDataURL(selectedFile);
  });
  button.addEventListener("click", async () => {
    if (!dataUrl || !modelSelect.value) { status.textContent = "Выбери изображение и vision-модель."; return; }
    button.disabled = true; button.textContent = "Анализирую…"; status.textContent = "Изображение отправлено модели…"; resultBox.innerHTML = '<p class="muted">Анализ выполняется…</p>';
    try {
      const result = await api("/chat", { method: "POST", body: JSON.stringify({ model: modelSelect.value, prompt: $("#image-prompt").value.trim() || "Опиши изображение и объясни задание.", image: dataUrl, messages: [] }) });
      resultBox.innerHTML = `<div class="answer-text">${renderText(result.answer || "Пустой ответ.")}</div>`;
      status.textContent = `Готово · ${result.model || modelSelect.value}`;
    } catch (error) { resultBox.textContent = error.message; status.textContent = "Не удалось завершить анализ."; }
    finally { button.disabled = false; button.textContent = "Проанализировать изображение →"; }
  });
}

const modelsGrid = $("#models-grid");
if (modelsGrid) {
  const search = $("#model-search"), filter = $("#model-filter"), status = $("#models-status");
  let allModels = [];
  function drawModels() {
    const q = search.value.toLowerCase().trim(), kind = filter.value;
    const shown = allModels.filter(m => (kind !== "vision" || m.vision) && (kind !== "free" || m.free) && (m.name + " " + m.id).toLowerCase().includes(q)).slice(0, 100);
    modelsGrid.innerHTML = shown.map(m => `<article class="model-card"><div class="model-card-top"><span class="model-symbol">✦</span><span class="tag">${m.vision ? "VISION" : "TEXT"}</span></div><h3>${escapeHtml(m.name)}</h3><p class="model-id">${escapeHtml(m.id)}</p><div class="model-tags">${m.vision ? "<span>Изображения</span>" : ""}${m.free ? "<span>Free tier</span>" : "<span>Тариф зависит от провайдера</span>"}</div><button class="button ghost model-use" data-model="${escapeHtml(m.id)}" type="button">Открыть в чате →</button></article>`).join("") || '<p class="muted">Ничего не найдено.</p>';
    modelsGrid.querySelectorAll(".model-use").forEach(btn => btn.addEventListener("click", () => { sessionStorage.setItem("ai-school-selected-model", btn.dataset.model); location.href = "./chat.html"; }));
  }
  Promise.all([loadModels(), api("/status").catch(() => null)]).then(([models]) => {
    allModels = models;
    status.textContent = models.length
      ? `Загружено моделей: ${models.length}. Перед использованием проверь лицензию и тариф конкретной модели.`
      : "Каталог пока недоступен. Проверь соединение с сервером и открой Настройки.";
    drawModels();
  });
  search.addEventListener("input", drawModels); filter.addEventListener("change", drawModels);
}

const serverStatus = $("#server-status");
async function checkStatus() {
  if (!serverStatus) return;
  serverStatus.textContent = "Проверяю…";
  try {
    const data = await api("/status");
    serverStatus.textContent = data.server ? "Сервер доступен" : "Сервер не отвечает";
    $("#provider-status").textContent = data.aiConfigured ? "AI-провайдер настроен." : "API-ключ не настроен. Добавь OPENROUTER_API_KEY в серверный .env.";
  } catch { serverStatus.textContent = "Сервер недоступен. Запусти npm run dev."; $("#provider-status").textContent = "AI-функции пока не подключены."; }
}
$("#check-server")?.addEventListener("click", checkStatus);
if (serverStatus) checkStatus();
$("#delete-history")?.addEventListener("click", () => { localStorage.removeItem(HISTORY_KEY); $("#settings-status").textContent = "Локальная история удалена."; });
