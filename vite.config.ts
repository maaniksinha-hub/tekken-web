import { defineConfig } from "vite";

// base "./" lets the build be served from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 1600, // Babylon.js is large by nature; it is split into its own cached chunk
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@babylonjs/loaders")) return "babylon-loaders";
          if (id.includes("node_modules/@babylonjs")) return "babylon";
        },
      },
    },
  },
});
