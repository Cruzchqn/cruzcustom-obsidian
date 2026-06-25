import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { NodeCardOptions } from "../types";

export class NodeCard extends Component {
  public el: HTMLElement;
  private readonly app: App;
  private readonly file: TFile;
  private readonly isCenter: boolean;
  private readonly isSuggested: boolean;
  private readonly onNavigate: (file: TFile) => void;

  // position within canvas coordinate space
  public x = 0;
  public y = 0;

  // collapse
  private collapsed = false;
  private collapseBtn: HTMLButtonElement | null = null;

  // drag
  private dragMoving = false;

  // injected by renderer after build
  public getScale: (() => number) | null = null;
  public onDrag: ((x: number, y: number) => void) | null = null;

  constructor(app: App, options: NodeCardOptions) {
    super();
    this.app = app;
    this.file = options.file;
    this.isCenter = options.isCenter;
    this.isSuggested = options.isSuggested;
    this.onNavigate = options.onNavigate;

    const classes = ["gev-node-card"];
    if (this.isCenter) classes.push("gev-node-card--center");
    else classes.push("gev-node-card--surrounding");
    if (this.isSuggested) classes.push("gev-node-card--suggested");

    this.el = document.createElement("div");
    this.el.className = classes.join(" ");
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  async build(): Promise<void> {
    const titleEl = this.el.createEl("div", { cls: "gev-node-card__title" });

    const nameSpan = titleEl.createEl("span", {
      cls: "gev-node-card__title-text",
      text: this.file.basename,
    });
    nameSpan.title = this.file.basename;

    // ↗ open in editor (all cards)
    const openBtn = titleEl.createEl("button", {
      cls: "gev-node-card__open-btn",
      title: "エディタで開く",
      text: "↗",
    });
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.app.workspace.getLeaf("tab").openFile(this.file);
    });

    // − collapse button (surrounding cards only)
    if (!this.isCenter) {
      this.collapseBtn = titleEl.createEl("button", {
        cls: "gev-node-card__collapse-btn",
        title: "折り畳む",
        text: "−",
      });
      this.collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
    }

    const contentEl = this.el.createEl("div", { cls: "gev-node-card__content" });

    try {
      const content = await this.app.vault.read(this.file);
      await MarkdownRenderer.render(this.app, content, contentEl, this.file.path, this);
    } catch {
      contentEl.setText("(読み込みエラー)");
    }

    // center card: click content → open editor
    if (this.isCenter) {
      contentEl.style.cursor = "text";
      contentEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.app.workspace.getLeaf("tab").openFile(this.file);
      });
    }

    // surrounding card: single click → navigate (unless drag occurred)
    if (!this.isCenter) {
      this.el.addEventListener("click", (e) => {
        if (this.dragMoving) return;
        e.stopPropagation();
        this.onNavigate(this.file);
      });
    }

    // title: drag to move + dblclick to center
    this._setupTitleInteraction(titleEl);
  }

  private _setupTitleInteraction(titleEl: HTMLElement): void {
    let startClientX = 0;
    let startClientY = 0;
    let startCardX = 0;
    let startCardY = 0;
    let moved = false;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      this.dragMoving = true;

      const scale = this.getScale?.() ?? 1;
      this.x = startCardX + dx / scale;
      this.y = startCardY + dy / scale;
      this.el.style.left = `${this.x}px`;
      this.el.style.top = `${this.y}px`;
      this.onDrag?.(this.x, this.y);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      titleEl.style.cursor = "grab";
      // reset dragMoving after click event fires
      setTimeout(() => { this.dragMoving = false; }, 0);
    };

    titleEl.style.cursor = "grab";

    titleEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      moved = false;
      this.dragMoving = false;
      startClientX = e.clientX;
      startClientY = e.clientY;
      startCardX = this.x;
      startCardY = this.y;
      titleEl.style.cursor = "grabbing";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    // dblclick title → make this file the center node
    titleEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (!this.isCenter) {
        this.onNavigate(this.file);
      }
    });
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.el.classList.add("gev-node-card--collapsed");
      if (this.collapseBtn) this.collapseBtn.textContent = "+";
    } else {
      this.el.classList.remove("gev-node-card--collapsed");
      if (this.collapseBtn) this.collapseBtn.textContent = "−";
    }
    this.onDrag?.(this.x, this.y);
  }
}
