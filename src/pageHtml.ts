import type { IncomingMessage, ServerResponse } from "node:http";

class PageHtml {
	public render(scriptPath: string): string {
		return `<!doctype html>
<html>
	<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta name="theme-color" content="#101827" />
	</head>
	<body>
			<script type="module" src="${scriptPath}"></script>
	</body>
</html>`;
	}

	public serveDev(request: IncomingMessage, response: ServerResponse, next: () => void): void {
		const requestUrl = request.url ?? "";
		if (requestUrl !== "/" && requestUrl !== "/index.html") {
			next();
			return;
		}
		response.statusCode = 200;
		response.setHeader("Content-Type", "text/html; charset=utf-8");
		response.end(this.render("/src/main.ts"));
	}
}

export { PageHtml };
