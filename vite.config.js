import { defineConfig } from "vite";
import { resolve } from "node:path";

// Multi-page static site. Relative base so it works on GitHub Pages / Netlify sub-paths.
export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        mapa: resolve(__dirname, "mapa.html"),
        sitio: resolve(__dirname, "sitio.html"),
        comparar: resolve(__dirname, "comparar.html"),
        pathfinder: resolve(__dirname, "pathfinder.html"),
        aprender: resolve(__dirname, "aprender.html"),
        acerca: resolve(__dirname, "acerca.html"),
        site: resolve(__dirname, "site.html"),
        compare: resolve(__dirname, "compare.html"),
        learn: resolve(__dirname, "learn.html"),
        about: resolve(__dirname, "about.html")
      }
    }
  }
});
