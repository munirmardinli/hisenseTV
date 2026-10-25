import { TvDashboard } from "./dashboard.js";
import { Translator } from "./text.js";
import type { ITv } from "./types.js";

class Main {
  public async run(): Promise<void> {
    const configResponse = await fetch("/api/config");
    const config = (await configResponse.json()) as ITv.PublicConfig;
    const messageResponse = await fetch(`/i18n/${config.locale}/ui.json`);
    const messages = (await messageResponse.json()) as ITv.MessageTree;
    new TvDashboard(config, new Translator(messages)).start();
  }
}

new Main().run();
