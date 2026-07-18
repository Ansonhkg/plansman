import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import {defineConfig} from "vite";

import vitePluginPreviewAnnotations from "./plugins/vite-plugin-preview-annotations";

function apiTarget(): string {
  if (process.env.PLANSMAN_API_URL) return process.env.PLANSMAN_API_URL;

  if (process.env.PORTLESS_URL) {
    const url = new URL(process.env.PORTLESS_URL);
    const hostname = url.hostname.split(".");
    hostname.splice(-2, 0, "api");
    url.hostname = hostname.join(".");
    return url.origin;
  }

  return "http://127.0.0.1:4000";
}

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ["@heroui/react", "@heroui-pro/react", "@iconify/react"],
  },
  plugins: [vitePluginPreviewAnnotations(), react(), tailwindcss()],
  server: {
    allowedHosts: true,
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3100),
    strictPort: true,
    proxy: {
      "/api": apiTarget(),
    },
  },
});
