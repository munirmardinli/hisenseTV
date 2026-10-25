import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { LogFile } from "./logFile.js";
import { Translator } from "./text.js";
import type { ITv } from "./types.js";

class ConfigFile {
  public async load(): Promise<ITv.AppConfig> {
    const content = await readFile(resolve("config.json"), "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!this.isRecord(parsed) || !this.isRecord(parsed.server) || !this.isRecord(parsed.tv) || !this.isRecord(parsed.certs) || !this.isRecord(parsed.storage)) {
      throw new Error("config");
    }
    const macAddress = typeof parsed.tv.macAddress === "string" ? parsed.tv.macAddress : "";
    return {
      locale: this.requiredString(parsed, "locale"),
      server: {
        host: this.requiredString(parsed.server, "host"),
        port: this.requiredPort(parsed.server, "port"),
      },
      tv: {
        host: this.requiredString(parsed.tv, "host"),
        port: this.requiredPort(parsed.tv, "port"),
        macAddress,
        brand: this.requiredString(parsed.tv, "brand"),
        model: this.requiredString(parsed.tv, "model"),
        operatingSystem: this.requiredString(parsed.tv, "operatingSystem"),
      },
      certs: {
        certFile: this.requiredString(parsed.certs, "certFile"),
        keyFile: this.requiredString(parsed.certs, "keyFile"),
      },
      storage: {
        directory: this.requiredString(parsed.storage, "directory"),
        fileName: this.requiredString(parsed.storage, "fileName"),
      },
      logFile: this.requiredLogFile(parsed),
    };
  }

  public async translator(locale: string, name: string, logFile: string): Promise<Translator> {
    const content = await readFile(resolve("src/i18n", locale, `${name}.json`), "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!this.isRecord(parsed)) {
      throw new Error(name);
    }
    return new Translator(parsed as ITv.MessageTree, new LogFile(logFile));
  }

  public devicePath(config: ITv.AppConfig): string {
    return join(homedir(), config.storage.directory, config.storage.fileName);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
  }

  private requiredString(source: Record<string, unknown>, key: string): string {
    const value = source[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(key);
    }
    return value;
  }

  private requiredLogFile(source: Record<string, unknown>): string {
    const value = this.requiredString(source, "logFile");
    if (!value.startsWith("assets/") || !value.endsWith("log") || value.includes("..")) {
      throw new Error("logFile");
    }
    return value;
  }

  private requiredPort(source: Record<string, unknown>, key: string): number {
    const value = source[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(key);
    }
    return value;
  }
}

export { ConfigFile };
