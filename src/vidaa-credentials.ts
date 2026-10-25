import { createHash } from "node:crypto";

import type { ITv } from "./types.js";

class VidaaCredentials {
  private readonly pattern = "38D65DC30F45109A369A86FCE866A85B";
  private readonly suffix = "h!i@s#$v%i^d&a*a";
  private readonly timeMask = 6239759785777146216n;

  public constructor(private readonly macAddress: string) { }

  public create(): ITv.Credentials {
    const timestamp = Math.floor(Date.now() / 1000);
    const mac = this.macAddress.replaceAll("-", ":").toUpperCase();
    const clientHash = this.md5(`${this.pattern}$${mac}`).slice(0, 6);
    const clientId = `${mac}$his$${clientHash}_vidaacommon_001`;
    const timeXor = BigInt(timestamp) ^ this.timeMask;
    const username = `his$${timeXor.toString()}`;
    const valueHash = this.md5(`his${this.sumDigits(timestamp) % 10}${this.suffix}`).slice(0, 6);
    const password = this.md5(`${timestamp}$${valueHash}`);
    return { clientId, username, password };
  }

  private md5(value: string): string {
    return createHash("md5").update(value, "utf8").digest("hex").toUpperCase();
  }

  private sumDigits(value: number): number {
    return Math.abs(value).toString().split("").reduce((sum, digit) => sum + Number(digit), 0);
  }
}

export { VidaaCredentials };
