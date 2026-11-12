import { test, expect } from "@playwright/test";

const textModel = {
  id: "qwen/qwen3-8b",
  name: "Qwen 3 8B",
  vision: false,
  free: true
};
const visionModel = {
  id: "qwen/qwen2.5-vl-7b-instruct",
  name: "Qwen 2.5 VL",
  vision: true,
  free: true
};
const customModel = {
  id: "new-provider/new-school-model:free",
  name: "New School Model",
  vision: false,
  free: true
};

async function mockApi(page) {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/models") {
      return route.fulfill({ json: { models: [textModel, visionModel], count: 2 } });
    }
    if (path === "/api/models/lookup") {
      const id = url.searchParams.get("id");
      if (id === customModel.id) return route.fulfill({ json: { model: customModel } });
      if (id === textModel.id) return route.fulfill({ json: { model: textModel } });
      return route.fulfill({ status: 404, json: { error: "Модель не найдена." } });
    }
    if (path === "/api/status") {
      return route.fulfill({ json: { server: true, aiConfigured: true, ttsConfigured: true } });
    }
    if (path === "/api/chat") {
      return route.fulfill({ json: { answer: "Проверочный ответ: решение выполнено по шагам.", model: textModel.id } });
    }
    if (path === "/api/tts") {
      return route.fulfill({ json: { audioContent: "SUQzAwAAAAAA", model: "inworld-tts-2" } });
    }
    if (path === "/api/tts/check") {
      return route.fulfill({ json: { ok: true, voiceId: "Ashley", model: "inworld-tts-2", message: "Inworld успешно создал тестовое аудио." } });
    }
    return route.fulfill({ status: 404, json: { error: "Неизвестный тестовый API маршрут." } });
  });
}

test("all primary pages load and show navigation", async ({ page }) => {
  const paths = [
    ["/", "Сложное становится"],
    ["/pages/subjects.html", "Школьные предметы"],
    ["/pages/chat.html", "Учебный чат"],
    ["/pages/image-analysis.html", "Разбор задания по фото"],
    ["/pages/models.html", "Каталог AI-моделей"],
    ["/pages/library.html", "Библиотека знаний"],
    ["/pages/settings.html", "Настройки проекта"]
  ];
  for (const [path, heading] of paths) {
    await page.goto(path);
    await expect(page.locator("h1")).toContainText(heading);
    await expect(page.locator("#site-header .main-nav a")).toHaveCount(6);
  }
});

test("user can add a model by exact ID and open it in the chat", async ({ page }) => {
  await mockApi(page);
  await page.goto("/pages/models.html");
  await page.locator("#custom-model-id").fill(customModel.id);
  await page.locator("#add-model").click();
  await expect(page.locator("#custom-model-status")).toContainText("добавлена");
  const newModelCard = page.locator(".model-card").filter({ hasText: "New School Model" });
  await expect(newModelCard).toContainText("New School Model");
  await newModelCard.getByRole("button", { name: "Выбрать для чата" }).click();
  await expect(page).toHaveURL(/chat\.html\?model=/);
  await expect(page.locator("#chat-model")).toHaveValue(customModel.id);
});

test("chat sends a question and displays the assistant answer", async ({ page }) => {
  await mockApi(page);
  await page.goto("/pages/chat.html");
  await expect(page.locator("#chat-model")).toHaveValue(textModel.id);
  await page.locator("#chat-input").fill("Объясни линейное уравнение.");
  await page.getByRole("button", { name: "Отправить вопрос" }).click();
  await expect(page.locator("#chat-messages")).toContainText("Проверочный ответ");
  await expect(page.locator("#chat-messages .tts-button")).toBeVisible();
  await page.locator(".tts-button").click();
  await expect(page.locator(".tts-audio")).toBeAttached();
});

test("image upload enables analysis and displays result", async ({ page }) => {
  await mockApi(page);
  await page.goto("/pages/image-analysis.html");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=", "base64");
  await page.locator("#image-file").setInputFiles({ name: "homework.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#analyze-image")).toBeEnabled();
  await page.locator("#analyze-image").click();
  await expect(page.locator("#image-result")).toContainText("Проверочный ответ");
});

test("settings can run the Inworld connectivity check", async ({ page }) => {
  await mockApi(page);
  await page.goto("/pages/settings.html");
  await page.locator("#check-inworld").click();
  await expect(page.locator("#inworld-status")).toContainText("успешно");
});


test("mobile chat layout fits viewport and keeps controls usable", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pages/chat.html");
  const dimensions = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    sendButtonWidth: document.querySelector("#chat-form button").getBoundingClientRect().width,
    navClientWidth: document.querySelector(".main-nav").clientWidth,
    navScrollWidth: document.querySelector(".main-nav").scrollWidth
  }));
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.sendButtonWidth).toBeGreaterThan(250);
  expect(dimensions.navScrollWidth).toBeGreaterThanOrEqual(dimensions.navClientWidth);
});
