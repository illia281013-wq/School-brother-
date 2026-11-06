const pagePrefix = location.pathname.includes("/pages/") ? "./" : "./pages/";
const navItems = [
  ["Главная", location.pathname.includes("/pages/") ? "../index.html" : "./index.html"],
  ["Предметы", pagePrefix + "subjects.html"],
  ["Учебный чат", pagePrefix + "chat.html"],
  ["Разбор фото", pagePrefix + "image-analysis.html"],
  ["AI-модели", pagePrefix + "models.html"],
  ["Формулы и правила", pagePrefix + "library.html"],
  ["Настройки", pagePrefix + "settings.html"]
];
const header = document.querySelector("#site-header");
if (header) header.innerHTML = `<header class="topbar"><a class="brand" href="${navItems[0][1]}"><span class="brand-mark">A<span>+</span></span><span><strong>AI SCHOOL</strong><small>ASSISTANT · 5–11 КЛАССЫ</small></span></a><nav class="main-nav">${navItems.slice(1).map(([label,url]) => `<a href="${url}">${label}</a>`).join("")}</nav><a class="top-cta" href="${pagePrefix}chat.html">Задать вопрос ↗</a></header>`;
const footer = document.querySelector("#site-footer");
if (footer) footer.innerHTML = `<footer class="footer"><a class="brand" href="${navItems[0][1]}"><span class="brand-mark">A<span>+</span></span><span><strong>AI SCHOOL</strong><small>ASSISTANT</small></span></a><p>Учись с пониманием. Шаг за шагом.</p><a href="${pagePrefix}settings.html">Настройки</a></footer>`;

const API = (import.meta.env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const $ = (selector) => document.querySelector(selector);
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API + path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  } catch {
    throw new Error("Не удалось связаться с сервером. Запусти проект командой npm run dev и проверь, что сервер работает.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) throw new Error("API не найден. Не открывай HTML-файл напрямую: запусти приложение через npm run dev или разверни серверную часть.");
    if (response.status === 413) throw new Error("Файл слишком большой для сервера. Выбери изображение меньшего размера.");
    if (response.status === 429) throw new Error("Слишком много запросов. Подожди немного и попробуй снова.");
    throw new Error(data.error || `Ошибка сервера (${response.status})`);
  }
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
  const price = model.free ? " · бесплатно (лимиты провайдера)" : " · тариф провайдера";
  return model.name + (model.vision ? " · умеет работать с фото" : " · текст") + price;
}
function fillSelect(select, models, preferred) {
  if (!select) return;
  const list = models.filter((m) => !select.dataset.vision || m.vision);
  select.innerHTML = list.length ? list.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(modelLabel(m))}</option>`).join("") : '<option value="">Модели не загрузились</option>';
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
  const clearButton = $("#clear-chat");
  function drawHistory() {
    messagesEl.innerHTML = history.length ? history.map((m) => `<div class="message ${m.role === "assistant" ? "assistant" : "user"}"><b>${m.role === "assistant" ? "AI School" : "Ты"}</b><p>${renderText(m.content)}</p></div>`).join("") : '<div class="message assistant"><b>AI School</b><p>Привет! Напиши вопрос по школьной теме.</p></div>';
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  drawHistory();
  let preferredChatModel = null;
  try {
    preferredChatModel = sessionStorage.getItem("ai-school-selected-model");
    sessionStorage.removeItem("ai-school-selected-model");
  } catch { /* Session storage may be disabled in private browsing. */ }
  const queryModel = new URLSearchParams(location.search).get("model");
  loadModels().then((loaded) => {
    models = loaded;
    fillSelect(modelSelect, models, queryModel || preferredChatModel);
    if (!models.length) status.textContent = "Не удалось загрузить модели. Проверь сервер в разделе «Настройки».";
    else if (!modelSelect.value) status.textContent = "Выбери модель и напиши вопрос.";
  });
  const params = new URLSearchParams(location.search);
  const subject = params.get("subject");
  if (subject) input.value = `Помоги мне с предметом «${subject}». Объясни тему простым языком.`;
  clearButton?.addEventListener("click", () => { history = []; saveHistory(history); drawHistory(); status.textContent = "История очищена."; });
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const text = input.value.trim();
    if (!text) { status.textContent = "Напиши вопрос или условие задания."; input.focus(); return; }
    const model = modelSelect.value;
    if (!model) { status.textContent = "Модели не загружены. Проверь сервер в разделе «Настройки»."; return; }
    sending = true; sendButton.disabled = true; input.disabled = true; if (clearButton) clearButton.disabled = true;
    history.push({ role: "user", content: text });
    drawHistory(); saveHistory(history); input.value = ""; status.textContent = "Готовлю объяснение…";
    const pending = document.createElement("div");
    pending.className = "message assistant"; pending.innerHTML = "<b>AI School</b><p>Думаю…</p>"; messagesEl.append(pending); messagesEl.scrollTop = messagesEl.scrollHeight;
    try {
      const result = await api("/chat", { method: "POST", body: JSON.stringify({ model, grade: $("#chat-grade").value, messages: history.slice(-12) }) });
      history.push({ role: "assistant", content: result.answer || "Не удалось получить текстовый ответ." });
      saveHistory(history); drawHistory(); status.textContent = `Ответ от ${result.model || model}`;
    } catch (error) {
      pending.remove();
      history.pop(); saveHistory(history); drawHistory();
      input.value = text;
      status.textContent = error.message + " Вопрос сохранён в поле — можно повторить отправку.";
    } finally {
      sending = false; sendButton.disabled = false; input.disabled = false; if (clearButton) clearButton.disabled = false; input.focus();
    }
  });
}

const fileInput = $("#image-file");
if (fileInput) {
  const preview = $("#image-preview"), button = $("#analyze-image"), status = $("#image-status"), resultBox = $("#image-result"), modelSelect = $("#vision-model");
  modelSelect.dataset.vision = "true";
  let selectedFile = null, dataUrl = "";
  loadModels().then((models) => { fillSelect(modelSelect, models.filter(m => m.vision)); if (!models.some(m => m.vision)) status.textContent = "Vision-модели не загрузились. Проверь подключение сервера."; });
  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files?.[0] || null;
    dataUrl = ""; button.disabled = true; preview.hidden = true;
    if (!selectedFile) { status.textContent = "Выбери изображение задания."; return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type) || selectedFile.size > 8 * 1024 * 1024) {
      status.textContent = "Поддерживаются JPG, PNG или WEBP до 8 МБ."; fileInput.value = ""; selectedFile = null; button.disabled = true; preview.hidden = true; return;
    }
    resultBox.innerHTML = '<p class="muted">Результат анализа появится здесь.</p>';
    const currentFile = selectedFile;
    const reader = new FileReader();
    reader.onload = () => {
      if (selectedFile !== currentFile) return;
      dataUrl = String(reader.result); preview.src = dataUrl; preview.hidden = false; button.disabled = false; status.textContent = `Фото готово: ${selectedFile.name}`;
    };
    reader.onerror = () => { if (selectedFile === currentFile) status.textContent = "Не удалось прочитать фото. Выбери другой файл."; };
    reader.readAsDataURL(selectedFile);
  });
  button.addEventListener("click", async () => {
    if (!dataUrl) { status.textContent = "Сначала выбери фото задания."; return; }
    if (!modelSelect.value) { status.textContent = "Нет доступной vision-модели. Проверь сервер и список моделей."; return; }
    button.disabled = true; button.textContent = "Разбираю фото…"; status.textContent = "Отправляю изображение модели…"; resultBox.innerHTML = '<p class="muted">Идёт анализ. Это может занять некоторое время.</p>';
    try {
      const result = await api("/chat", { method: "POST", body: JSON.stringify({ model: modelSelect.value, prompt: $("#image-prompt").value.trim() || "Прочитай изображение и объясни задание.", image: dataUrl, messages: [] }) });
      resultBox.innerHTML = `<div class="answer-text">${renderText(result.answer || "Модель вернула пустой ответ.")}</div>`;
      status.textContent = `Готово · ${result.model || modelSelect.value}`;
    } catch (error) { resultBox.textContent = error.message; status.textContent = "Не удалось завершить анализ."; }
    finally { button.disabled = !dataUrl; button.textContent = "Разобрать фото →"; }
  });
}

const modelsGrid = $("#models-grid");
if (modelsGrid) {
  const search = $("#model-search"), filter = $("#model-filter"), status = $("#models-status");
  let allModels = [];
  function drawModels() {
    const q = search.value.toLowerCase().trim(), kind = filter.value;
    const shown = allModels.filter(m => (kind !== "vision" || m.vision) && (kind !== "free" || m.free) && (m.name + " " + m.id).toLowerCase().includes(q)).slice(0, 100);
    modelsGrid.innerHTML = shown.map(m => `<article class="model-card"><div class="model-card-top"><span class="model-symbol">✦</span><span class="tag">${m.vision ? "Фото + текст" : "Только текст"}</span></div><h3>${escapeHtml(m.name)}</h3><p class="model-id">${escapeHtml(m.id)}</p><div class="model-tags">${m.vision ? "<span>Поддержка фото</span>" : ""}${m.free ? "<span>Есть бесплатный тариф</span>" : "<span>Стоимость зависит от провайдера</span>"}</div><button class="button ghost model-use" data-model="${escapeHtml(m.id)}" type="button">Выбрать для чата →</button></article>`).join("") || '<p class="muted">По этому запросу моделей нет.</p>';
    modelsGrid.querySelectorAll(".model-use").forEach(btn => btn.addEventListener("click", () => { try { sessionStorage.setItem("ai-school-selected-model", btn.dataset.model); } catch { /* Continue to chat if session storage is disabled. */ } location.href = "./chat.html?model=" + encodeURIComponent(btn.dataset.model); }));
  }
  Promise.all([loadModels(), api("/status").catch(() => null)]).then(([models]) => {
    allModels = models;
    status.textContent = models.length
      ? `В каталоге ${models.length} моделей. Бесплатный тариф может иметь ограничения.`
      : "Каталог не загрузился. Проверь запуск сервера и настройки.";
    drawModels();
  });
  search.addEventListener("input", drawModels); filter.addEventListener("change", drawModels);
}

const serverStatus = $("#server-status");
async function checkStatus() {
  if (!serverStatus) return;
  serverStatus.textContent = "Проверяю соединение…";
  try {
    const data = await api("/status");
    serverStatus.textContent = data.server ? "Сервер работает" : "Сервер не отвечает";
    $("#provider-status").textContent = (data.aiConfigured ? "AI-модели подключены. " : "Нет ключа OpenRouter. ") + (data.ttsConfigured ? "Озвучка Inworld подключена." : "Озвучка Inworld не настроена: добавь INWORLD_API_KEY в серверный .env.");
  } catch { serverStatus.textContent = "Сервер недоступен. Запусти npm run dev."; $("#provider-status").textContent = "AI и озвучка недоступны, пока сервер не запущен."; }
}
$("#check-server")?.addEventListener("click", checkStatus);
if (serverStatus) checkStatus();
$("#delete-history")?.addEventListener("click", () => { try { localStorage.removeItem(HISTORY_KEY); $("#settings-status").textContent = "История чата на этом устройстве удалена."; } catch { $("#settings-status").textContent = "Браузер запретил доступ к локальному хранилищу."; } });
