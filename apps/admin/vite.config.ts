import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendProxyTarget = process.env.BLOG_SYSTEM_ADMIN_PROXY_TARGET ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: backendProxyTarget,
        changeOrigin: true
      },
      "/content-files": {
        target: backendProxyTarget,
        changeOrigin: true
      },
      "/media": {
        target: backendProxyTarget,
        changeOrigin: true
      },
      "/project-files": {
        target: backendProxyTarget,
        changeOrigin: true
      },
      "/theme-files": {
        target: backendProxyTarget,
        changeOrigin: true
      }
    }
  }
});
