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
      includeAssets: ["favicon.svg"],
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
