// Adds Inworld speech controls to assistant answers in the chat.
(() => {
  const messages = document.querySelector("#chat-messages");
  if (!messages) return;
  let activeAudio = null;
  let activeButton = null;
  let activeUrl = null;

  function addSpeechButtons() {
    messages.querySelectorAll(".message.assistant").forEach((message) => {
      if (message.dataset.ttsAdded || message.textContent.includes("Думаю…")) return;
      const paragraph = message.querySelector("p");
      const text = paragraph?.textContent?.trim();
      if (!text) return;
      message.dataset.ttsAdded = "true";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button ghost small-button tts-button";
      button.textContent = "🔊 Озвучить ответ";
      button.setAttribute("aria-label", "Озвучить ответ AI School");
      message.append(button);
    });
  }

  messages.addEventListener("click", async (event) => {
    const button = event.target.closest(".tts-button");
    if (!button) return;
    if (activeAudio && activeButton === button) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      button.textContent = "🔊 Озвучить ответ";
      activeAudio.remove();
      activeAudio = null;
      activeButton = null;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
      activeUrl = null;
      return;
    }

    const text = button.closest(".message")?.querySelector("p")?.textContent?.trim();
    if (!text) return;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.remove();
      if (activeButton) activeButton.textContent = "🔊 Озвучить ответ";
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    }
    activeAudio = null;
    activeButton = button;
    activeUrl = null;
    button.disabled = true;
    button.textContent = "Создаю аудио…";
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 2000) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Ошибка озвучки (${response.status})`);
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
      button.textContent = "⏹ Остановить";
      button.disabled = false;
      audio.addEventListener("ended", () => { button.textContent = "🔊 Озвучить ответ"; });
      try { await audio.play(); } catch { /* Visible audio controls let the user start playback manually. */ }
    } catch (error) {
      button.textContent = "Не удалось озвучить";
      button.title = error.message;
      const note = document.createElement("p");
      note.className = "muted small tts-error";
      note.textContent = error.message;
      button.after(note);
    } finally {
      button.disabled = false;
    }
  });

  new MutationObserver(addSpeechButtons).observe(messages, { childList: true, subtree: true });
  addSpeechButtons();
})();
