import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        overview: "index.html",
        detail: "detail.html",
        world: "world.html",
      },
    },
  },
});
