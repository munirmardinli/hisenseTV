import type { ITv } from "./types.js";
import type { Translator } from "./text.js";

class TvDashboard {
  private root!: HTMLElement;
  private status!: HTMLElement;
  private pinInput!: HTMLInputElement;
  private pinButton!: HTMLButtonElement;
  private pairButton!: HTMLButtonElement;
  private readonly remoteButtons: HTMLButtonElement[] = [];
  private paired = false;
  private readonly keys: ITv.TvKey[] = [
    "KEY_POWER", "KEY_HOME", "KEY_RETURNS",
    "KEY_UP", "KEY_DOWN", "KEY_LEFT", "KEY_RIGHT", "KEY_OK",
    "KEY_VOLUMEUP", "KEY_VOLUMEDOWN", "KEY_MUTE", "KEY_PLAY",
  ];
  private readonly roundKeys: ITv.TvKey[] = ["KEY_UP", "KEY_DOWN", "KEY_LEFT", "KEY_RIGHT", "KEY_OK"];
  private readonly layout: Array<ITv.TvKey | ""> = [
    "KEY_POWER", "KEY_UP", "KEY_HOME",
    "KEY_LEFT", "KEY_OK", "KEY_RIGHT",
    "KEY_VOLUMEUP", "KEY_DOWN", "KEY_VOLUMEDOWN",
    "KEY_MUTE", "KEY_PLAY", "KEY_RETURNS",
  ];
  public constructor(
    private readonly config: ITv.PublicConfig,
    private readonly text: Translator,
  ) { }

  public start(): void {
    document.documentElement.lang = this.config.locale;
    document.title = this.text.render("meta.title", this.values());
    document.body.style.cssText = "margin:0;min-width:320px;min-height:100vh;background:#000;color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    const theme = this.element("style", "");
    theme.textContent = "input::placeholder{color:#fff;opacity:1}button:disabled{opacity:.4}";
    document.head.append(theme);
    this.root = this.element("main", "display:flex;flex-direction:column;width:min(100% - 36px,760px);min-height:100vh;margin:0 auto;box-sizing:border-box");
    this.status = this.element("p", "min-height:24px;margin:16px 0 0;color:#fff;font-size:14px;line-height:1.6");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.pinInput = this.element("input", "width:150px;min-height:46px;padding:0 12px;border:1px solid #fff;border-radius:10px;background:#000;color:#fff;font:inherit;font-size:20px;letter-spacing:8px");
    this.pinInput.type = "text";
    this.pinInput.inputMode = "numeric";
    this.pinInput.maxLength = 4;
    this.pinInput.autocomplete = "one-time-code";
    this.pinInput.setAttribute("aria-label", this.text.render("pair.pinLabel"));
    this.pinInput.placeholder = this.text.render("pair.pinPlaceholder");
    this.pinInput.hidden = true;
    this.pinInput.addEventListener("input", this.onPinInput);
    this.pinButton = this.button(this.text.render("pair.confirm"), "#fff", "#000");
    this.pinButton.hidden = true;
    this.pinButton.addEventListener("click", this.onConfirmPairing);
    this.pairButton = this.button(this.text.render("pair.start"), "#fff", "#000");
    this.pairButton.addEventListener("click", this.onStartPairing);
    document.body.replaceChildren(this.root);
    this.render();
    void this.loadState();
  }

  private values(): Record<string, string> {
    return {
      brand: this.config.tv.brand,
      model: this.config.tv.model,
      operatingSystem: this.config.tv.operatingSystem,
    };
  }

  private render(): void {
    const hero = this.element("section", "padding:40px 0 24px");
    hero.append(
      this.element("h1", "margin:0;font-size:clamp(34px,7vw,54px);line-height:1.1;letter-spacing:-1.3px", this.text.render("hero.heading", this.values())),
      this.element("p", "margin:12px 0 0;color:#fff;font-size:15px;line-height:1.7", this.text.render("hero.lead")),
    );
    const pairCard = this.element("section", "padding:21px;border:1px solid #fff;border-radius:15px;background:#000");
    pairCard.append(
      this.element("h2", "margin:0 0 8px;font-size:17px", this.text.render("pair.heading")),
      this.element("p", "margin:0;color:#fff;font-size:13px;line-height:1.65", this.text.render("pair.lead")),
    );
    const pairActions = this.element("div", "display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:16px");
    pairActions.append(this.pairButton, this.pinInput, this.pinButton);
    pairCard.append(pairActions, this.status);
    const remoteCard = this.element("section", "width:max-content;margin:28px auto 0;padding:26px 18px 30px;border:1px solid #fff;border-radius:48px;background:#000");
    const controls = this.element("div", "display:grid;grid-template-columns:repeat(3,76px);grid-auto-rows:76px;gap:10px");
    for (const key of this.layout) {
      if (key === "") {
        controls.append(this.element("span", ""));
        continue;
      }
      controls.append(this.remoteButton(this.text.render(`remote.keys.${key}`), this.text.render(`remote.names.${key}`), key));
    }
    remoteCard.append(controls);
    const footer = this.element("footer", "margin-top:auto;padding:36px 0 20px;border-top:1px solid #fff;text-align:center");
    const credit = this.element("p", "margin:0;font-size:13px");
    const link = this.element("a", "color:#fff", this.text.render("footer.name"));
    link.href = this.text.render("footer.href");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    credit.append(this.element("span", "", this.text.render("footer.lead")), link);
    footer.append(credit);
    this.root.append(hero, pairCard, remoteCard, footer);
  }

  private async loadState(): Promise<void> {
    try {
      const response = await fetch("/api/state");
      const result = (await response.json()) as ITv.ApiResponse;
      if (!response.ok || !result.ok) {
        throw new Error(result.message);
      }
      this.paired = result.paired === true;
      this.updateControls();
      const stateText = this.paired ? this.text.render("status.paired") : this.text.render("status.unpaired");
      this.status.textContent = stateText;
      this.report("trace.uiState", stateText);
    } catch (error) {
      this.status.textContent = this.text.render("status.serverDown", { message: this.errorMessage(error) });
    }
  }

  private readonly onStartPairing = (): void => {
    void this.startPairing();
  };

  private async startPairing(): Promise<void> {
    this.setButtonsDisabled(true);
    this.status.textContent = this.text.render("status.requesting");
    try {
      const result = await this.post("/api/pair/start", {});
      this.pinInput.hidden = false;
      this.pinButton.hidden = false;
      this.pinInput.focus();
      this.status.textContent = result.message;
    } catch (error) {
      this.status.textContent = this.text.render("status.pairFailed", { message: this.errorMessage(error) });
    } finally {
      this.updateControls();
    }
  }

  private readonly onConfirmPairing = (): void => {
    void this.confirmPairing();
  };

  private async confirmPairing(): Promise<void> {
    this.setButtonsDisabled(true);
    this.status.textContent = this.text.render("status.sendingPin");
    try {
      const result = await this.post("/api/pair/confirm", { pin: this.pinInput.value });
      this.paired = result.paired === true;
      this.pinInput.value = "";
      this.pinInput.hidden = true;
      this.pinButton.hidden = true;
      this.status.textContent = result.message;
    } catch (error) {
      this.status.textContent = this.text.render("status.pinFailed", { message: this.errorMessage(error) });
    } finally {
      this.updateControls();
    }
  }

  private readonly onPinInput = (): void => {
    this.report("trace.uiField", this.text.render("pair.pinLabel"), this.pinInput.value.length);
  };

  private readonly onRemoteClick = (event: Event): void => {
    const key = (event.currentTarget as HTMLButtonElement).dataset.key;
    if (!key || !this.isTvKey(key)) {
      return;
    }
    void this.sendKey(key);
  };

  private async sendKey(key: ITv.TvKey): Promise<void> {
    this.report("trace.uiClick", key);
    if (!this.paired) {
      this.status.textContent = this.text.render("status.needPair");
      return;
    }
    this.setButtonsDisabled(true);
    this.status.textContent = this.text.render("status.sendingKey");
    try {
      const result = await this.post("/api/remote", { key });
      if (result.needsPin) {
        this.pinInput.hidden = false;
        this.pinButton.hidden = false;
        this.pinInput.focus();
      }
      this.status.textContent = result.message;
    } catch (error) {
      this.status.textContent = this.text.render("status.keyFailed", { message: this.errorMessage(error) });
    } finally {
      this.updateControls();
    }
  }

  private async post(path: string, body: object): Promise<ITv.ApiResponse> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as ITv.ApiResponse;
    if ((!response.ok || !result.ok) && !result.needsPin) {
      throw new Error(result.message);
    }
    return result;
  }

  private button(label: string, background: string, color: string): HTMLButtonElement {
    const button = this.element(
      "button",
      `min-height:46px;padding:0 13px;border:1px solid #fff;border-radius:10px;background:${background};color:${color};font:inherit;font-size:13px;font-weight:700;cursor:pointer`,
      label,
    );
    button.type = "button";
    return button;
  }

  private remoteButton(label: string, name: string, key: ITv.TvKey): HTMLButtonElement {
    const filled = key === "KEY_OK";
    const round = this.roundKeys.some((roundKey) => roundKey === key);
    const button = this.button(label, filled ? "#fff" : "#000", filled ? "#000" : "#fff");
    button.style.width = "76px";
    button.style.height = "76px";
    button.style.padding = "0";
    button.style.borderRadius = round ? "50%" : "18px";
    button.style.fontSize = filled ? "18px" : "28px";
    button.setAttribute("aria-label", name);
    button.title = name;
    button.dataset.key = key;
    button.disabled = true;
    button.addEventListener("click", this.onRemoteClick);
    this.remoteButtons.push(button);
    return button;
  }

  private setButtonsDisabled(disabled: boolean): void {
    this.pairButton.disabled = disabled;
    this.pinButton.disabled = disabled;
    const remoteLocked = disabled || !this.paired;
    for (const button of this.remoteButtons) {
      button.disabled = remoteLocked;
    }
    this.report("trace.buttons", this.text.render(remoteLocked ? "trace.locked" : "trace.unlocked"));
  }

  private updateControls(): void {
    this.setButtonsDisabled(false);
  }

  private report(event: string, detail: string, length?: number): void {
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, detail, length }),
    }).catch(this.ignoreReport);
  }

  private readonly ignoreReport = (): void => undefined;

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : this.text.render("status.unknown");
  }

  private isTvKey(key: string): key is ITv.TvKey {
    return this.keys.some((supportedKey) => supportedKey === key);
  }

  private element<K extends keyof HTMLElementTagNameMap>(tag: K, styles: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.style.cssText = styles;
    if (text) {
      element.textContent = text;
    }
    return element;
  }
}

export { TvDashboard };
