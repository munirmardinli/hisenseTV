import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { ClientCertificate } from "./clientCertificate.js";
import { ConfigFile } from "./config.js";
import type { Translator } from "./text.js";
import type { ITv } from "./types.js";
import { VidaaClient } from "./vidaa-client.js";
import { PinRequired } from "./pingRequired.js";

class TvServer {
  private pairingClient: VidaaClient | undefined;
  private remoteClient: VidaaClient | undefined;
  private remoteTask: Promise<void> = Promise.resolve();
  private pairingMacAddress = "";
  private lastReply = "";
  private attempts = 0;
  private replyWaits = 0;
  private bodyText = "";
  private readonly configFile = new ConfigFile();
  private readonly uiEvents = ["trace.uiClick", "trace.uiField", "trace.uiState", "trace.buttons"];
  private readonly supportedKeys: ITv.TvKey[] = [
    "KEY_POWER", "KEY_HOME", "KEY_RETURNS", "KEY_UP", "KEY_DOWN",
    "KEY_LEFT", "KEY_RIGHT", "KEY_OK", "KEY_VOLUMEUP", "KEY_VOLUMEDOWN",
    "KEY_MUTE", "KEY_PLAY",
  ];

  public constructor(
    private readonly config: ITv.AppConfig,
    private readonly text: Translator,
  ) { }

  public start(): void {
    const server = createServer(this.onRequest);
    server.listen(this.config.server.port, this.config.server.host, this.onListen);
    server.on("error", this.onListenError);
  }

  private readonly onListen = (): void => {
    this.text.write("log.listening", {
      host: this.config.server.host,
      port: this.config.server.port,
    });
    this.text.write("log.target", {
      brand: this.config.tv.brand,
      model: this.config.tv.model,
      tvHost: this.config.tv.host,
    });
  };

  private readonly onListenError = (error: Error): void => {
    this.text.write("log.listenFailed", { message: error.stack ?? error.message });
    process.exitCode = 1;
  };

  private readonly onRequest = (request: IncomingMessage, response: ServerResponse): void => {
    void this.handleRequest(request, response);
  };

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://${this.config.server.host}`);
      if (requestUrl.pathname.startsWith("/api/")) {
        this.text.write("trace.request", { method: request.method ?? "", path: requestUrl.pathname });
      }
      if (request.method === "GET" && requestUrl.pathname === "/api/state") {
        const device = await this.readDevice();
        this.sendJson(response, 200, {
          ok: true,
          message: device ? this.text.render("api.paired") : this.text.render("api.notPaired"),
          paired: Boolean(device),
        });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/api/config") {
        this.sendJson(response, 200, {
          ok: true,
          locale: this.config.locale,
          tv: {
            host: this.config.tv.host,
            brand: this.config.tv.brand,
            model: this.config.tv.model,
            operatingSystem: this.config.tv.operatingSystem,
          },
        });
        return;
      }
      if (request.method === "GET" && /^\/i18n\/[a-z]{2}\/[a-z]+\.json$/.test(requestUrl.pathname)) {
        const file = await readFile(resolve("src", requestUrl.pathname.slice(1)));
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(file);
        return;
      }
      if (request.method === "POST") {
        const origin = `http://${this.config.server.host}:${this.config.server.port}`;
        if (request.headers.origin !== origin) {
          this.sendJson(response, 403, { ok: false, message: this.text.render("api.originRejected") });
          return;
        }
        if (requestUrl.pathname === "/api/pair/start") {
          await this.startPairing(response);
          return;
        }
        if (requestUrl.pathname === "/api/pair/confirm") {
          await this.confirmPairing(request, response);
          return;
        }
        if (requestUrl.pathname === "/api/remote") {
          await this.sendRemoteKey(request, response);
          return;
        }
        if (requestUrl.pathname === "/api/log") {
          await this.writeUiLog(request, response);
          return;
        }
      }
      if (request.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html")) {
        const html = await readFile(resolve("dist/index.html"));
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }
      if (request.method === "GET" && /^\/assets\/[A-Za-z0-9._-]+$/.test(requestUrl.pathname)) {
        const asset = await readFile(resolve("dist", requestUrl.pathname.slice(1)));
        const contentType = requestUrl.pathname.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : "text/css; charset=utf-8";
        response.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff" });
        response.end(asset);
        return;
      }
      this.sendJson(response, 404, { ok: false, message: this.text.render("api.notFound") });
    } catch (error) {
      const message = error instanceof Error ? error.message : this.text.render("api.unknown");
      const detail = error instanceof Error ? error.stack ?? error.message : message;
      this.text.write("log.failed", { message: detail });
      if (!response.headersSent) {
        this.sendJson(response, 502, { ok: false, message });
      } else {
        response.destroy();
      }
    }
  }

  private async startPairing(response: ServerResponse): Promise<void> {
    await this.pairingClient?.close();
    this.pairingClient = undefined;
    this.pairingMacAddress = "";
    const macAddress = await this.findTvMacAddress();
    const client = new VidaaClient(this.text, this.config.tv.port, resolve(this.config.certs.certFile), resolve(this.config.certs.keyFile));
    try {
      await client.connect(this.config.tv.host, macAddress);
      await client.startPairing();
      this.pairingClient = client;
      this.pairingMacAddress = macAddress;
      this.sendJson(response, 200, { ok: true, message: this.text.render("api.pinPrompt") });
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  private async confirmPairing(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readBody(request);
    if (!body.pin || !/^\d{4}$/.test(body.pin)) {
      this.sendJson(response, 400, { ok: false, message: this.text.render("api.pinInvalid") });
      return;
    }
    if (!this.pairingClient || !this.pairingMacAddress) {
      this.sendJson(response, 409, { ok: false, message: this.text.render("api.pinFirst") });
      return;
    }
    const macAddress = this.pairingMacAddress;
    const client = this.pairingClient;
    try {
      await client.authenticate(body.pin);
      await this.waitForReply(client);
      if (client.sessionState() === "rejected") {
        this.text.write("trace.pinRejected");
        this.sendJson(response, 409, { ok: false, message: this.text.render("trace.pinRejected") });
        return;
      }
      if (client.sessionState() !== "ready") {
        this.text.write("trace.noReply");
        this.sendJson(response, 409, { ok: false, message: this.text.render("trace.noReply") });
        return;
      }
      await this.saveDevice({ host: this.config.tv.host, macAddress });
      if (this.remoteClient && this.remoteClient !== client) {
        await this.remoteClient.close();
      }
      this.remoteClient = client;
      this.pairingClient = undefined;
      this.pairingMacAddress = "";
      this.sendJson(response, 200, { ok: true, paired: true, message: this.text.render("api.pinSent") });
    } catch (error) {
      await client.close();
      this.pairingClient = undefined;
      this.pairingMacAddress = "";
      throw error;
    }
  }

  private async waitForReply(client: VidaaClient): Promise<void> {
    this.replyWaits = 0;
    while (this.replyWaits < 25 && !client.sawReply()) {
      await delay(200);
      this.replyWaits += 1;
    }
  }

  private async sendRemoteKey(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readBody(request);
    if (!body.key || !this.isTvKey(body.key)) {
      this.sendJson(response, 400, { ok: false, message: this.text.render("api.keyRejected") });
      return;
    }
    const device = await this.readDevice();
    if (!device) {
      this.sendJson(response, 409, { ok: false, message: this.text.render("api.pairFirst") });
      return;
    }
    const key = body.key;
    const run = this.remoteTask.catch(this.ignoreFailure).then(() => this.deliverKey(key));
    this.remoteTask = run;
    try {
      await run;
    } catch (error) {
      if (error instanceof PinRequired) {
        this.sendJson(response, 409, { ok: false, needsPin: true, message: error.message });
        return;
      }
      throw error;
    }
    this.sendJson(response, 200, { ok: true, message: this.text.render("api.commandSent") });
  }

  private readonly ignoreFailure = (): undefined => undefined;

  private async deliverKey(key: ITv.TvKey): Promise<void> {
    const device = await this.readDevice();
    if (!device) {
      throw new Error(this.text.render("api.pairFirst"));
    }
    this.text.write("trace.remoteKey", { key, host: device.host });
    if (!this.remoteClient?.isOpen()) {
      await this.remoteClient?.close();
      const client = new VidaaClient(this.text, this.config.tv.port, resolve(this.config.certs.certFile), resolve(this.config.certs.keyFile));
      try {
        await client.connect(device.host, device.macAddress);
      } catch (error) {
        await client.close();
        this.remoteClient = undefined;
        throw error;
      }
      this.remoteClient = client;
      await this.remoteClient.startPairing();
      await this.waitForReply(this.remoteClient);
    }
    if (!this.remoteClient || this.remoteClient.sessionState() !== "ready") {
      if (this.remoteClient) {
        if (this.pairingClient && this.pairingClient !== this.remoteClient) {
          await this.pairingClient.close();
        }
        this.pairingClient = this.remoteClient;
        this.pairingMacAddress = device.macAddress;
      }
      this.text.write("trace.pinRequired", { key });
      throw new PinRequired(this.text.render("api.pinPrompt"));
    }
    await this.remoteClient.sendKey(key);
  }

  private async writeUiLog(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readBody(request);
    if (body.event && this.uiEvents.some((event) => event === body.event)) {
      this.text.write(body.event, { detail: body.detail ?? "", length: body.length ?? 0 });
    }
    this.sendJson(response, 200, { ok: true, message: "" });
  }

  private async findTvMacAddress(): Promise<string> {
    const configured = this.config.tv.macAddress.trim();
    if (configured) {
      return configured.replaceAll("-", ":").toUpperCase();
    }
    this.lastReply = "";
    this.attempts = 0;
    while (this.attempts < 3) {
      await new Promise<void>((resolvePing) => {
        execFile("/sbin/ping", ["-c", "1", "-W", "2000", this.config.tv.host], () => resolvePing());
      });
      const iface = await this.routeInterface();
      const table = await this.readArpTable(iface);
      const macAddress = this.macAddressForHost(table);
      if (macAddress) {
        return macAddress;
      }
      this.lastReply = table.split(/\r?\n/).filter((line) => line.includes(this.config.tv.host)).join("\n");
      this.attempts += 1;
      await delay(400);
    }
    throw new Error(this.text.render("mac.missing", { host: this.config.tv.host, reply: this.lastReply }));
  }

  private routeInterface(): Promise<string | undefined> {
    return new Promise((resolveInterface) => {
      execFile("/sbin/route", ["-n", "get", this.config.tv.host], { timeout: 2000 }, (error, stdout) => {
        if (error) {
          resolveInterface(undefined);
          return;
        }
        resolveInterface(stdout.match(/^\s*interface:\s+(\S+)/m)?.[1]);
      });
    });
  }

  private async readArpTable(iface: string | undefined): Promise<string> {
    const lookups: string[][] = [["-n", this.config.tv.host]];
    if (iface) {
      lookups.push(["-n", "-i", iface, this.config.tv.host], ["-a", "-n", "-i", iface]);
    }
    const outputs: string[] = [];
    for (const args of lookups) {
      outputs.push(await this.exec("/usr/sbin/arp", args));
    }
    outputs.push(await this.exec("/usr/sbin/netstat", ["-rn", "-f", "inet"]));
    return outputs.join("\n");
  }

  private macAddressForHost(table: string): string | undefined {
    const host = this.config.tv.host.replaceAll(".", "\\.");
    const hostPattern = new RegExp(`(?:^|[\\s(])${host}(?:$|[\\s)])`);
    for (const line of table.split(/\r?\n/)) {
      if (!hostPattern.test(line) || line.includes("incomplete") || line.includes("no entry")) {
        continue;
      }
      const match = line.match(/(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
      if (match) {
        return match[0].replaceAll("-", ":").toUpperCase();
      }
    }
    return undefined;
  }

  private exec(command: string, args: string[]): Promise<string> {
    return new Promise((resolveOutput) => {
      execFile(command, args, { timeout: 3000 }, (error, stdout, stderr) => {
        resolveOutput([stdout, stderr, error?.message].filter((value) => value && value.trim()).join("\n"));
      });
    });
  }

  private async readBody(request: IncomingMessage): Promise<ITv.RequestBody> {
    this.bodyText = "";
    for await (const chunk of request) {
      this.bodyText += chunk.toString();
      if (this.bodyText.length > 1024) {
        throw new Error(this.text.render("api.bodyTooLarge"));
      }
    }
    if (!this.bodyText) {
      return {};
    }
    const body: unknown = JSON.parse(this.bodyText);
    if (!body || typeof body !== "object") {
      throw new Error(this.text.render("api.bodyInvalid"));
    }
    const pin = Reflect.get(body, "pin");
    const key = Reflect.get(body, "key");
    const event = Reflect.get(body, "event");
    const detail = Reflect.get(body, "detail");
    const length = Reflect.get(body, "length");
    return {
      pin: typeof pin === "string" ? pin : undefined,
      key: typeof key === "string" ? key : undefined,
      event: typeof event === "string" ? event : undefined,
      detail: typeof detail === "string" ? detail : undefined,
      length: typeof length === "number" ? length : undefined,
    };
  }

  private async readDevice(): Promise<ITv.StoredDevice | undefined> {
    try {
      const content = await readFile(this.configFile.devicePath(this.config), "utf8");
      const device: unknown = JSON.parse(content);
      const macAddress = device && typeof device === "object" ? Reflect.get(device, "macAddress") : undefined;
      if (!device || typeof device !== "object" || Reflect.get(device, "host") !== this.config.tv.host || typeof macAddress !== "string") {
        throw new Error(this.text.render("api.deviceInvalid"));
      }
      return { host: this.config.tv.host, macAddress };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  private async saveDevice(device: ITv.StoredDevice): Promise<void> {
    const path = this.configFile.devicePath(this.config);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, JSON.stringify(device), { encoding: "utf8", mode: 0o600 });
  }

  private sendJson(response: ServerResponse, status: number, payload: object): void {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(payload));
  }

  private isTvKey(key: string): key is ITv.TvKey {
    return this.supportedKeys.some((supportedKey) => supportedKey === key);
  }
}

class Main {
  public async run(): Promise<void> {
    const configFile = new ConfigFile();
    const config = await configFile.load();
    const text = await configFile.translator(config.locale, "server", config.logFile);
    await new ClientCertificate(text, resolve(config.certs.certFile), resolve(config.certs.keyFile)).ensure();
    new TvServer(config, text).start();
  }
}

new Main().run();
