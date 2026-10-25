import { defineConfig } from "vite";

import { HtmlPage } from "./src/htmlPage.js";

class ViteConfig {
  public create(): ReturnType<typeof defineConfig> {
    return defineConfig({
      plugins: [new HtmlPage()],
      build: {
        rollupOptions: {
          input: "src/main.ts",
        },
      },
    });
  }
}

export default new ViteConfig().create();
