import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "0.0.0.0",
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: true } }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        subjects: "pages/subjects.html",
        chat: "pages/chat.html",
        imageAnalysis: "pages/image-analysis.html",
        models: "pages/models.html",
        library: "pages/library.html",
        settings: "pages/settings.html"
      }
    }
  }
});