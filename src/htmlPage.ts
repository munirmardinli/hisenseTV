import { type Plugin, type ViteDevServer } from "vite";
import type { OutputBundle, PluginContext } from "rollup";

import { PageHtml } from "./pageHtml.js";

class HtmlPage implements Plugin {
	public readonly name = "typescript-only-page";
	public readonly configureServer: (server: ViteDevServer) => void;
	public readonly generateBundle: (this: PluginContext, options: unknown, bundle: OutputBundle) => void;
	private readonly page = new PageHtml();

	public constructor() {
		this.configureServer = (server) => {
			server.middlewares.use((request, response, next) => {
				this.page.serveDev(request, response, next);
			});
		};
		this.generateBundle = this.writeHtml;
	}

	private writeHtml(this: PluginContext, _options: unknown, bundle: OutputBundle): void {
		const entry = Object.values(bundle).find((output) => output.type === "chunk" && output.isEntry);
		if (!entry || entry.type !== "chunk") {
			throw new Error("missing-entry");
		}
		this.emitFile({
			type: "asset",
			fileName: "index.html",
			source: new PageHtml().render(`/${entry.fileName}`),
		});
	}
}

export { HtmlPage };
