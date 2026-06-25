/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
//
// `base: '/'` — the app is served from the root of the custom subdomain
// (indetectable.felipeflorez.dev), NOT from a GitHub Pages subpath like
// /repo/. See CLAUDE.md §3 "Base path detail".
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  // Emit pure-ASCII JS so emoji (astral-plane chars, > U+FFFF) are stored as
  // `\uXXXX` surrogate escapes instead of raw UTF-8 bytes. This makes the bundle
  // immune to any serving/CDN layer that mis-transcodes 4-byte UTF-8 into U+FFFD
  // (�) — the share-card emoji corruption seen on wa.me. The JS engine
  // reconstructs the emoji from the escapes at runtime.
  esbuild: { charset: "ascii" },
  test: {
    // Default to a DOM-free environment so the detector (pure TS, src/detector)
    // can be unit-tested without jsdom. See CLAUDE.md §12.
    // Component/DOM tests opt in per-file with:  // @vitest-environment jsdom
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
});
