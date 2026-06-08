import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Dev: proxy /api -> backend FastAPI (cổng 8000).
// Prod: FastAPI tự phục vụ thư mục dist nên dùng đường dẫn /api tương đối.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Tự đăng ký SW trong code (main.tsx) để bắt được sự kiện cập nhật và
      // reload — KHÔNG dùng script register mặc định (bản tối giản, không reload
      // khi có bản mới → phải Ctrl+Shift+R mới thấy code mới).
      injectRegister: false,
      includeAssets: ["favicon.svg", "logo_finos.png"],
      workbox: {
        // Dọn cache của bản build cũ ngay khi SW mới kích hoạt.
        cleanupOutdatedCaches: true,
        importScripts: ["/push-sw.js"],
        // /api luôn đi thẳng tới backend, không bao giờ trả index.html từ cache.
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: "FinOS Hotel — Kế toán khách sạn",
        short_name: "FinOS Hotel",
        description: "Số hóa sổ sách khách sạn bằng OCR",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        lang: "vi",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
