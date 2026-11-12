// Inworld speech controls for assistant answers.
const TTS_API_BASE = (import.meta.env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

(() => {
  const messages = document.querySelector("#chat-messages");
  if (!messages) return;

  let activeAudio = null;
  let activeButton = null;
  let activeUrl = null;

  function releaseAudio() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
      activeAudio.remove();
    }
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    if (activeButton?.isConnected) {
      activeButton.disabled = false;
      activeButton.textContent = "🔊 Озвучить ответ";
      activeButton.removeAttribute("aria-pressed");
    }
    activeAudio = null;
    activeButton = null;
    activeUrl = null;
  }

  function addSpeechButtons() {
    messages.querySelectorAll(".message.assistant").forEach(message => {
      if (message.dataset.ttsAdded || message.textContent.includes("Думаю…")) return;
      const paragraph = message.querySelector("p");
      if (!paragraph?.textContent?.trim()) return;
      message.dataset.ttsAdded = "true";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button ghost small-button tts-button";
      button.textContent = "🔊 Озвучить ответ";
      button.setAttribute("aria-label", "Озвучить ответ AI School");
      button.setAttribute("aria-pressed", "false");
      message.append(button);
    });
  }

  messages.addEventListener("click", async event => {
    const button = event.target.closest(".tts-button");
    if (!button) return;

    if (activeAudio && activeButton === button) {
      if (activeAudio.ended) activeAudio.currentTime = 0;
      if (activeAudio.paused) {
        try {
          await activeAudio.play();
          button.textContent = "⏸ Пауза";
          button.setAttribute("aria-pressed", "true");
        } catch {
          button.textContent = "Не удалось запустить";
        }
      } else {
        activeAudio.pause();
        button.textContent = "▶ Продолжить";
        button.setAttribute("aria-pressed", "false");
      }
      return;
    }

    releaseAudio();
    const answer = button.closest(".message")?.querySelector("p")?.textContent?.trim();
    if (!answer) return;

    activeButton = button;
    button.disabled = true;
    button.textContent = "Создаю аудио…";

    try {
      const response = await fetch(TTS_API_BASE + "/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(50000),
        body: JSON.stringify({ text: answer.slice(0, 2000) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Ошибка озвучки (${response.status})`);
      if (typeof data.audioContent !== "string" || !data.audioContent) throw new Error("Сервис не вернул аудио.");

      const binary = atob(data.audioContent);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      activeUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));

      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.className = "tts-audio";
      audio.src = activeUrl;
      button.after(audio);
      activeAudio = audio;
      audio.addEventListener("play", () => {
        if (activeButton === button) {
          button.textContent = "⏸ Пауза";
          button.setAttribute("aria-pressed", "true");
        }
      });
      audio.addEventListener("pause", () => {
        if (activeButton === button && !audio.ended) {
          button.textContent = "▶ Продолжить";
          button.setAttribute("aria-pressed", "false");
        }
      });
      audio.addEventListener("ended", () => {
        if (activeButton === button) {
          button.textContent = "↻ Повторить";
          button.setAttribute("aria-pressed", "false");
        }
      });
      button.disabled = false;
      try {
        await audio.play();
      } catch {
        button.textContent = "▶ Воспроизвести";
        button.setAttribute("aria-pressed", "false");
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = "↻ Повторить озвучку";
      button.title = error.message;
      const note = document.createElement("p");
      note.className = "muted small tts-error";
      note.setAttribute("role", "status");
      note.textContent = error.message;
      button.after(note);
    }
  });

  new MutationObserver(addSpeechButtons).observe(messages, { childList: true, subtree: true });
  addSpeechButtons();
})();
