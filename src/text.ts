import type { LogFile } from "./logFile.js";
import type { ITv } from "./types.js";

class Translator {
  private current: string | ITv.MessageTree | undefined;
  private rendered = "";

  public constructor(
    private readonly messages: ITv.MessageTree,
    private readonly logFile?: LogFile,
  ) { }

  public render(key: string, values?: ITv.TextValues): string {
    this.current = this.messages;
    for (const part of key.split(".")) {
      if (!this.current || typeof this.current === "string") {
        return key;
      }
      this.current = this.current[part];
    }
    if (typeof this.current !== "string") {
      return key;
    }
    this.rendered = this.current;
    for (const [name, value] of Object.entries(values ?? {})) {
      this.rendered = this.rendered.replaceAll(`{${name}}`, String(value));
    }
    return this.rendered;
  }

  public write(key: string, values?: ITv.TextValues): void {
    const line = this.render(key, values);
    console.log(line);
    this.logFile?.append(line);
  }
}

export { Translator };
