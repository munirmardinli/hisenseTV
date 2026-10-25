import { readFileSync } from "node:fs";
import tls from "node:tls";
import mqttPacket from "mqtt-packet";

import { VidaaCredentials } from "./vidaa-credentials.js";
import type { ITv } from "./types.js";
import type { Translator } from "./text.js";

class VidaaClient {
  private socket: tls.TLSSocket | undefined;
  private parser = mqttPacket.parser({ protocolVersion: 4 });
  private clientId = "";
  private host = "";
  private credentials: ITv.Credentials | undefined;
  private settled = false;
  private replySeen = false;
  private session: "none" | "pin" | "ready" | "rejected" = "none";
  private readonly topics: string[] = [];
  private grantIndex = 0;
  private generation = 0;
  private messageId = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private resolveConnect: () => void = () => undefined;
  private rejectConnect: (error: Error) => void = () => undefined;

  public constructor(
    private readonly text: Translator,
    private readonly tvPort: number,
    private readonly certFile: string,
    private readonly keyFile: string,
  ) { }

  public async connect(host: string, macAddress: string): Promise<void> {
    this.host = host;
    this.credentials = new VidaaCredentials(macAddress).create();
    this.clientId = this.credentials.clientId;
    this.text.write("trace.connect", { host, clientId: this.clientId });
    await this.open();
  }

  public isOpen(): boolean {
    return Boolean(this.socket && !this.socket.destroyed && this.settled);
  }

  public sawReply(): boolean {
    return this.replySeen;
  }

  public sessionState(): "none" | "pin" | "ready" | "rejected" {
    return this.session;
  }

  public async sendKey(key: ITv.TvKey): Promise<void> {
    await this.ensureConnected();
    await this.publish(`/remoteapp/tv/remote_service/${this.clientId}/actions/sendkey`, key);
    await this.wait(500);
  }

  public async startPairing(): Promise<void> {
    this.replySeen = false;
    this.session = "none";
    await this.ensureConnected();
    await this.publish(
      `/remoteapp/tv/ui_service/${this.clientId}/actions/vidaa_app_connect`,
      JSON.stringify({ app_version: 2, connect_result: 0, device_type: "Mobile App" }),
    );
  }

  public async authenticate(pin: string): Promise<void> {
    this.replySeen = false;
    this.session = "none";
    await this.ensureConnected();
    await this.publish(
      `/remoteapp/tv/ui_service/${this.clientId}/actions/authenticationcode`,
      JSON.stringify({ authNum: pin }),
    );
  }

  public async close(): Promise<void> {
    this.generation += 1;
    const socket = this.socket;
    this.socket = undefined;
    clearTimeout(this.timer);
    if (!socket || socket.destroyed) {
      return;
    }
    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.end();
      setTimeout(() => resolve(), 800);
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }
    await this.open();
  }

  private async open(): Promise<void> {
    const credentials = this.credentials;
    if (!credentials || !this.host) {
      throw new Error(this.text.render("vidaa.noConnection"));
    }
    this.generation += 1;
    const generation = this.generation;
    this.settled = false;
    this.parser = mqttPacket.parser({ protocolVersion: 4 });
    this.parser.on("packet", (packet: { cmd?: string; returnCode?: number }) => {
      if (generation !== this.generation) {
        return;
      }
      this.onPacket(packet);
    });
    this.parser.on("error", (error: Error) => {
      if (generation !== this.generation) {
        return;
      }
      this.finishConnect(error);
    });
    const pending = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });
    this.timer = setTimeout(() => {
      if (generation !== this.generation) {
        return;
      }
      this.finishConnect(new Error(this.text.render("vidaa.timeout")));
    }, 8000);
    const socket = tls.connect({
      host: this.host,
      port: this.tvPort,
      rejectUnauthorized: false,
      cert: readFileSync(this.certFile),
      key: readFileSync(this.keyFile),
    });
    this.socket = socket;
    socket.on("data", (data: Buffer) => {
      if (generation !== this.generation || socket !== this.socket) {
        return;
      }
      this.parser.parse(data);
    });
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (generation !== this.generation) {
        return;
      }
      if (error.code === "ECONNREFUSED") {
        this.finishConnect(new Error(this.text.render("vidaa.refused", { port: this.tvPort })));
        return;
      }
      this.finishConnect(error);
    });
    socket.on("close", () => {
      if (generation !== this.generation) {
        return;
      }
      this.text.write("trace.closed");
      this.finishConnect(new Error(this.text.render("vidaa.closed")));
    });
    socket.write(mqttPacket.generate({
      cmd: "connect",
      protocolId: "MQTT",
      protocolVersion: 4,
      clean: true,
      keepalive: 60,
      clientId: credentials.clientId,
      username: credentials.username,
      password: Buffer.from(credentials.password),
    }));
    await pending;
  }

  private async publish(topic: string, payload: string): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.destroyed) {
      throw new Error(this.text.render("vidaa.noConnection"));
    }
    await new Promise<void>((resolve, reject) => {
      const packet = mqttPacket.generate({
        cmd: "publish",
        topic,
        payload,
        qos: 0,
        dup: false,
        retain: false,
        messageId: 0,
      });
      this.text.write("trace.publish", { topic, payload });
      socket.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private finishConnect(error?: Error): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    clearTimeout(this.timer);
    if (error) {
      this.socket?.destroy();
      this.rejectConnect(error);
      return;
    }
    this.resolveConnect();
  }

  private onPacket(packet: { cmd?: string; returnCode?: number; topic?: string; payload?: Buffer | string; granted?: number[] }): void {
    if (packet.cmd === "pingreq") {
      this.socket?.write(mqttPacket.generate({ cmd: "pingresp" }));
      this.text.write("trace.ping");
      return;
    }
    if (packet.cmd === "publish") {
      const payload = Buffer.isBuffer(packet.payload) ? packet.payload.toString("utf8") : String(packet.payload ?? "");
      this.noteIncoming(packet.topic ?? "", payload);
      return;
    }
    if (packet.cmd === "suback") {
      this.grantIndex = 0;
      for (const topic of this.topics) {
        const code = packet.granted?.[this.grantIndex] ?? -1;
        this.grantIndex += 1;
        this.text.write("trace.suback", { topic, code });
      }
      this.finishConnect();
      return;
    }
    if (packet.cmd !== "connack") {
      return;
    }
    if (packet.returnCode === 0) {
      this.text.write("trace.connack");
      this.subscribe();
      return;
    }
    this.finishConnect(new Error(this.text.render("vidaa.mqttRejected", { code: packet.returnCode ?? -1 })));
  }

  private subscribe(): void {
    this.topics.length = 0;
    this.topics.push(
      `/remoteapp/mobile/${this.clientId}/ui_service/data/authentication`,
      `/remoteapp/mobile/${this.clientId}/ui_service/data/authenticationcode`,
      `/remoteapp/mobile/${this.clientId}/ui_service/data/authenticationcodetoast`,
      `/remoteapp/mobile/${this.clientId}/ui_service/data/authenticationcodeclose`,
      `/remoteapp/mobile/${this.clientId}/ui_service/data/tokenissuance`,
      `/remoteapp/mobile/${this.clientId}/ui_service/data/vidaa_app_connect`,
      `/remoteapp/mobile/${this.clientId}/platform_service/data/tokenissuance`,
    );
    for (const topic of this.topics) {
      this.text.write("trace.subscribe", { topic });
    }
    this.messageId += 1;
    this.socket?.write(mqttPacket.generate({
      cmd: "subscribe",
      messageId: this.messageId,
      subscriptions: this.topics.map((topic) => ({ topic, qos: 0 })),
    }));
  }

  private noteIncoming(topic: string, payload: string): void {
    this.replySeen = true;
    this.text.write("trace.incoming", { topic, payload: payload.slice(0, 300) });
    if (topic.endsWith("/data/authentication") && payload.trim() === "") {
      this.session = "pin";
      return;
    }
    if (topic.endsWith("/data/authenticationcode")) {
      this.notePinResult(payload);
      return;
    }
    if (topic.includes("tokenissuance") || payload.includes("accesstoken")) {
      this.session = "ready";
      return;
    }
    if (!payload.includes("connect_result")) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(payload);
      const value = parsed && typeof parsed === "object" ? Reflect.get(parsed, "connect_result") : undefined;
      if (value === 1) {
        this.session = "ready";
      }
    } catch {
      return;
    }
  }

  private notePinResult(payload: string): void {
    try {
      const parsed: unknown = JSON.parse(payload);
      const result = parsed && typeof parsed === "object" ? Reflect.get(parsed, "result") : undefined;
      if (result === 1) {
        this.session = "ready";
        this.text.write("trace.pinAccepted");
        this.requestToken();
        return;
      }
      if (result === 100) {
        this.session = "rejected";
        this.text.write("trace.pinRejected");
      }
    } catch {
      return;
    }
  }

  private requestToken(): void {
    const tokenTopic = `/remoteapp/tv/platform_service/${this.clientId}/data/gettoken`;
    const closeTopic = `/remoteapp/tv/ui_service/${this.clientId}/actions/authenticationcodeclose`;
    this.text.write("trace.publish", { topic: tokenTopic, payload: "{\"refreshtoken\":\"\"}" });
    this.socket?.write(mqttPacket.generate({
      cmd: "publish",
      topic: tokenTopic,
      payload: "{\"refreshtoken\":\"\"}",
      qos: 0,
      dup: false,
      retain: false,
      messageId: 0,
    }));
    this.socket?.write(mqttPacket.generate({
      cmd: "publish",
      topic: closeTopic,
      payload: "",
      qos: 0,
      dup: false,
      retain: false,
      messageId: 0,
    }));
  }
}

export { VidaaClient };
