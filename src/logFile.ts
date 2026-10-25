import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

class LogFile {
  private readonly path: string;
  private readonly ready: Promise<void>;
  private chain: Promise<void> = Promise.resolve();

  public constructor(file: string) {
    this.path = resolve(file);
    this.ready = mkdir(dirname(this.path), { recursive: true }).then(() => undefined);
  }

  public append(line: string): void {
    const stamped = `${new Date().toISOString()} ${line}\n`;
    this.chain = this.chain.catch(this.ignore).then(() => this.ready).then(() => appendFile(this.path, stamped));
  }

  private readonly ignore = (): undefined => undefined;
}

export { LogFile };
