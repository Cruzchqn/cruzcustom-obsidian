import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { NodeCardOptions } from "../types";

export class NodeCard extends Component {
  public el: HTMLElement;
  private readonly app: App;
  private readonly file: TFile;
  private readonly isCenter: boolean;
  private readonly isSuggested: boolean;
  private readonly onNavigate: (file: TFile) => void;

  // position = visual center of this card in canvas coords
  public x = 0;
  public y = 0;

  // collapse
  private collapsed = false;
  private collapseBtn: HTMLButtonElement | null = null;

  // interaction suppression
  private dragMoving = false;
  private _resizing  = false;

  // injected by renderer
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

  // visual center in canvas coordinates
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  // center of the card element (accounts for actual rendered size)
  getCenter(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  async build(): Promise<void> {
    // ── Title bar ─────────────────────────────────────────
    const titleEl = this.el.createEl("div", { cls: "gev-node-card__title" });

    titleEl.createEl("span", {
      cls: "gev-node-card__title-text",
      text: this.file.basename,
    }).title = this.file.basename;

    // ↗ open in editor
    const openBtn = titleEl.createEl("button", {
      cls: "gev-node-card__open-btn",
      title: "エディタで開く",
      text: "↗",
    });
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.app.workspace.getLeaf("tab").openFile(this.file);
    });

    // ✎ inline edit (center card only)
    if (this.isCenter) {
      this._buildEditToggle(titleEl);
    }

    // − collapse (surrounding cards)
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

    // ── Content ───────────────────────────────────────────
    const contentEl = this.el.createEl("div", { cls: "gev-node-card__content" });

    try {
      const content = await this.app.vault.read(this.file);
      await MarkdownRenderer.render(this.app, content, contentEl, this.file.path, this);
    } catch {
      contentEl.setText("(読み込みエラー)");
    }

    // surrounding card: click → navigate (unless drag or resize)
    if (!this.isCenter) {
      this.el.addEventListener("click", (e) => {
        if (this.dragMoving || this._resizing) return;
        e.stopPropagation();
        this.onNavigate(this.file);
      });
    }

    // ── Interactions ──────────────────────────────────────
    this._setupTitleDrag(titleEl);
    this._setupResize();
  }

  // ── Inline edit ───────────────────────────────────────

  private _buildEditToggle(titleEl: HTMLElement): void {
    let editing = false;
    let textarea: HTMLTextAreaElement | null = null;
    const contentEl = () => this.el.querySelector<HTMLElement>(".gev-node-card__content")!;

    const editBtn = titleEl.createEl("button", {
      cls: "gev-node-card__edit-btn",
      title: "編集 (Ctrl+S で保存 / Esc で閉じる)",
      text: "✎",
    });

    const save = async () => {
      if (textarea) await this.app.vault.modify(this.file, textarea.value);
    };

    const exitEdit = async () => {
      await save();
      textarea?.remove();
      textarea = null;
      editing = false;
      editBtn.textContent = "✎";
      editBtn.title = "編集 (Ctrl+S で保存 / Esc で閉じる)";
      const c = contentEl();
      if (c) c.style.display = "";
    };

    const enterEdit = async () => {
      editing = true;
      editBtn.textContent = "✓";
      editBtn.title = "保存して閉じる";
      const c = contentEl();
      if (c) c.style.display = "none";

      const raw = await this.app.vault.read(this.file);
      textarea = this.el.createEl("textarea", { cls: "gev-node-card__textarea" });
      textarea.value = raw;
      textarea.focus();

      textarea.addEventListener("keydown", async (e) => {
        if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          await save();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          await exitEdit();
        }
      });
    };

    editBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (editing) await exitEdit();
      else await enterEdit();
    });
  }

  // ── Title drag ────────────────────────────────────────

  private _setupTitleDrag(titleEl: HTMLElement): void {
    let startClientX = 0;
    let startClientY = 0;
    let startCardX = 0;
    let startCardY = 0;
    let moved = false;

    const onMove = (e: MouseEvent) => {
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

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      titleEl.style.cursor = "grab";
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
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // dblclick title → center on this file
    titleEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (!this.isCenter) this.onNavigate(this.file);
    });
  }

  // ── Edge resize ───────────────────────────────────────

  private _setupResize(): void {
    const dirs = [
      { cls: "gev-resize-e",  cursor: "ew-resize",  dx: true,  dy: false },
      { cls: "gev-resize-s",  cursor: "ns-resize",  dx: false, dy: true  },
      { cls: "gev-resize-se", cursor: "se-resize",  dx: true,  dy: true  },
    ];

    for (const { cls, cursor, dx, dy } of dirs) {
      const handle = this.el.createEl("div", { cls: `gev-resize-handle ${cls}` });
      handle.style.cursor = cursor;

      handle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._resizing = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = this.el.offsetWidth;
        const startH = this.el.offsetHeight;

        const onMove = (ev: MouseEvent) => {
          const scale = this.getScale?.() ?? 1;
          if (dx) {
            const w = Math.max(120, startW + (ev.clientX - startX) / scale);
            this.el.style.width = `${w}px`;
          }
          if (dy) {
            const h = Math.max(80, startH + (ev.clientY - startY) / scale);
            this.el.style.maxHeight = "none";
            this.el.style.height = `${h}px`;
          }
          this.onDrag?.(this.x, this.y);
        };

        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          setTimeout(() => { this._resizing = false; }, 0);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }
  }

  // ── Collapse ──────────────────────────────────────────

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.el.classList.toggle("gev-node-card--collapsed", this.collapsed);
    if (this.collapseBtn) this.collapseBtn.textContent = this.collapsed ? "+" : "−";
    this.onDrag?.(this.x, this.y);
  }
}
