import { defineConfig } from "vite";
export default defineConfig({
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
