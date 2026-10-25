import { execFile } from "node:child_process";
import { createPrivateKey, X509Certificate } from "node:crypto";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Translator } from "./text.js";

class ClientCertificate {
  private readonly storePassword = "186e990688070325a1c4b0ce275d2388";
  private readonly certificateUrl = "https://raw.githubusercontent.com/tombabolewski/vidaa-control/main/vidaa/certs/vidaa_client.pem";
  private readonly keyUrl = "https://raw.githubusercontent.com/tombabolewski/vidaa-control/main/vidaa/certs/vidaa_client.key";

  public constructor(
    private readonly text: Translator,
    private readonly certFile: string,
    private readonly keyFile: string,
  ) { }

  public async ensure(): Promise<void> {
    if (await this.trusted()) {
      return;
    }
    const folder = dirname(this.certFile);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const store = await this.findStore(folder);
    if (store === "") {
      await this.download();
    } else {
      await this.extract(store, ["-clcerts", "-nokeys"], this.certFile);
      await this.extract(store, ["-nocerts", "-nodes"], this.keyFile);
    }
    await chmod(this.keyFile, 0o600);
    if (!(await this.trusted())) {
      throw new Error(this.text.render("vidaa.certsRejected", { path: folder }));
    }
    this.text.write("vidaa.certsCreated", { path: this.certFile });
  }

  private async trusted(): Promise<boolean> {
    try {
      const certificate = new X509Certificate(this.pemBlock(await readFile(this.certFile, "utf8"), "CERTIFICATE"));
      const key = createPrivateKey(this.pemBlock(await readFile(this.keyFile, "utf8"), "PRIVATE KEY"));
      return certificate.issuer.includes("RemoteCA") && certificate.checkPrivateKey(key);
    } catch {
      return false;
    }
  }

  private async findStore(folder: string): Promise<string> {
    try {
      const names = await readdir(folder);
      const name = names.find((entry) => entry.toLowerCase().endsWith(".p12"));
      return name ? join(folder, name) : "";
    } catch {
      return "";
    }
  }

  private pemBlock(content: string, label: string): string {
    const start = content.indexOf(`-----BEGIN ${label}-----`);
    const end = content.indexOf(`-----END ${label}-----`);
    if (start < 0 || end < 0) {
      return content;
    }
    return content.slice(start, end + `-----END ${label}-----`.length);
  }

  private async download(): Promise<void> {
    await this.save(this.certificateUrl, this.certFile, 0o644);
    await this.save(this.keyUrl, this.keyFile, 0o600);
  }

  private async save(url: string, path: string, mode: number): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(this.text.render("vidaa.certsFailed", { message: String(response.status) }));
    }
    await writeFile(path, await response.text(), { encoding: "utf8", mode });
  }

  private extract(store: string, options: string[], output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile("openssl", [
        "pkcs12", "-in", store,
        "-passin", `pass:${this.storePassword}`,
        ...options,
        "-out", output,
      ], (error) => {
        if (error) {
          reject(new Error(this.text.render("vidaa.certsFailed", { message: error.message })));
          return;
        }
        resolve();
      });
    });
  }
}

export { ClientCertificate };
