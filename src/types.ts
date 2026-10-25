declare namespace ITv {
  export interface AppConfig {
    locale: string;
    server: { host: string; port: number };
    tv: {
      host: string;
      port: number;
      macAddress: string;
      brand: string;
      model: string;
      operatingSystem: string;
    };
    certs: { certFile: string; keyFile: string };
    storage: { directory: string; fileName: string };
    logFile: string;
  }
  export type TvKey =
    | "KEY_POWER"
    | "KEY_HOME"
    | "KEY_RETURNS"
    | "KEY_UP"
    | "KEY_DOWN"
    | "KEY_LEFT"
    | "KEY_RIGHT"
    | "KEY_OK"
    | "KEY_VOLUMEUP"
    | "KEY_VOLUMEDOWN"
    | "KEY_MUTE"
    | "KEY_PLAY";

  export interface ApiResponse {
    ok: boolean;
    message: string;
    paired?: boolean;
    needsPin?: boolean;
  }

  export interface PublicConfig {
    locale: string;
    tv: {
      host: string;
      brand: string;
      model: string;
      operatingSystem: string;
    };
  }

  export interface StoredDevice {
    host: string;
    macAddress: string;
  }

  export interface RequestBody {
    pin?: string;
    key?: string;
    event?: string;
    detail?: string;
    length?: number;
  }

  export type Text = (key: string, values?: Record<string, string | number>) => string;
  export type TextValues = Record<string, string | number>;
  export type MessageTree = { [key: string]: string | MessageTree };
  export interface Credentials {
    clientId: string;
    username: string;
    password: string;
  }
}

export type { ITv };
