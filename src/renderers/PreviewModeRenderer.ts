import { App, Component, Menu, TFile } from "obsidian";
import { GraphState } from "../types";
import { NodeCard } from "../components/NodeCard";

const HINT_DISMISSED_KEY = "gev-hint-dismissed";

export class PreviewModeRenderer extends Component {
  private wrapperEl: HTMLElement;
  private canvasEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private activeCards: NodeCard[] = [];
  private lineMap = new WeakMap<NodeCard, SVGLineElement>();
  private centerCard: NodeCard | null = null;

  // pan / zoom
  private panX = 0;
  private panY = 0;
  private scale = 1;

  // pan drag
  private panning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panOriginX = 0;
  private panOriginY = 0;

  private _boundPanMove: (e: MouseEvent) => void;
  private _boundPanUp: (e: MouseEvent) => void;

  constructor(
    private readonly app: App,
    containerEl: HTMLElement,
    private readonly parentComponent: Component,
    private readonly onNavigate: (file: TFile) => void,
    private readonly onBackgroundClick: () => void,
    private readonly onOverflowDotClick: (file: TFile) => void,
    private readonly onMoreClick: () => void,
    private readonly onBackClick: (() => void) | null
  ) {
    super();
    this.wrapperEl = containerEl.createEl("div", { cls: "gev-preview-wrapper" });
    this.canvasEl = this.wrapperEl.createEl("div", { cls: "gev-canvas" });

    this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    this.svgEl.classList.add("gev-svg-overlay");
    this.canvasEl.appendChild(this.svgEl);

    this._boundPanMove = this._onPanMove.bind(this);
    this._boundPanUp   = this._onPanUp.bind(this);
    this._setupPanZoom();
  }

  // ── pan / zoom ────────────────────────────────────────

  private _applyTransform(): void {
    this.canvasEl.style.transform =
      `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  private _setupPanZoom(): void {
    this.wrapperEl.addEventListener("wheel", (e) => {
      if ((e.target as Element).closest(
        ".gev-node-card__content, .gev-node-card__textarea"
      )) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(3, Math.max(0.15, this.scale * factor));
      const rect = this.wrapperEl.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ccx = (cx - this.panX) / this.scale;
      const ccy = (cy - this.panY) / this.scale;
      this.panX = cx - ccx * newScale;
      this.panY = cy - ccy * newScale;
      this.scale = newScale;
      this._applyTransform();
    }, { passive: false });

    this.wrapperEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (this._isInteractable(e.target as Element)) return;
      this.panning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panOriginX = this.panX;
      this.panOriginY = this.panY;
      this.wrapperEl.style.cursor = "grabbing";
      document.addEventListener("mousemove", this._boundPanMove);
      document.addEventListener("mouseup", this._boundPanUp);
    });

    this.wrapperEl.addEventListener("click", (e) => {
      if (!this._isInteractable(e.target as Element)) {
        this.onBackgroundClick();
      }
    });

    this.wrapperEl.addEventListener("contextmenu", (e) => {
      if (this._isInteractable(e.target as Element)) return;
      e.preventDefault();

      // canvas coordinate at right-click position
      const rect = this.wrapperEl.getBoundingClientRect();
      const cx = (e.clientX - rect.left - this.panX) / this.scale;
      const cy = (e.clientY - rect.top  - this.panY) / this.scale;

      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("この位置に新規ノートを作成")
          .setIcon("file-plus")
          .onClick(async () => {
            const newFile = await this.app.vault.create("Untitled.md", "");
            this.onNavigate(newFile);
          })
      );
      menu.showAtMouseEvent(e);
    });
  }

  private _onPanMove(e: MouseEvent): void {
    if (!this.panning) return;
    this.panX = this.panOriginX + (e.clientX - this.panStartX);
    this.panY = this.panOriginY + (e.clientY - this.panStartY);
    this._applyTransform();
  }

  private _onPanUp(e: MouseEvent): void {
    if (!this.panning) return;
    const moved = Math.hypot(e.clientX - this.panStartX, e.clientY - this.panStartY);
    this.panning = false;
    this.wrapperEl.style.cursor = "";
    document.removeEventListener("mousemove", this._boundPanMove);
    document.removeEventListener("mouseup", this._boundPanUp);
    if (moved > 5) e.stopImmediatePropagation();
  }

  private _isInteractable(t: Element): boolean {
    return !!(
      t.closest(".gev-node-card") ||
      t.closest(".gev-dot-pill") ||
      t.closest(".gev-more-btn") ||
      t.closest(".gev-back-btn") ||
      t.closest(".gev-hint-bar") ||
      t.closest(".gev-suggested-banner")
    );
  }

  // ── render ────────────────────────────────────────────

  async render(state: GraphState): Promise<void> {
    this.clearAll();

    const w = this.wrapperEl.clientWidth  || 800;
    const h = this.wrapperEl.clientHeight || 600;
    const centerPos    = { x: w / 2, y: h / 2 };
    const radius       = Math.min(w, h) * 0.34;

    this.svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const surroundPositions = computeCircularPositions(
      state.surroundingFiles.length,
      centerPos,
      radius
    );

    // center card
    const centerCard = this._makeCard(state.centerFile, true, false);
    this.centerCard = centerCard;

    // surrounding cards
    const surroundCards = state.surroundingFiles.map((f) =>
      this._makeCard(f, false, state.isSuggested)
    );

    await Promise.all([centerCard, ...surroundCards].map((c) => c.build()));

    // position center card — line anchor = card center
    centerCard.setPosition(centerPos.x, centerPos.y);
    this.canvasEl.appendChild(centerCard.el);

    for (let i = 0; i < surroundCards.length; i++) {
      const card = surroundCards[i];
      const pos  = surroundPositions[i];
      card.setPosition(pos.x, pos.y);
      this.canvasEl.appendChild(card.el);

      if (!state.isSuggested) {
        // line from center to surrounding — both use visual-center coords
        const line = this._drawLine(centerPos, pos);
        this.lineMap.set(card, line);
      }
    }

    // overflow: render as pill tray in bottom-right of canvas
    if (state.overflowFiles.length > 0) {
      this._renderDotTray(state.overflowFiles, w, h);
    }

    if (this.onBackClick) this._renderBackButton();
    if (state.isSuggested) this._renderSuggestedBanner();
    if (!localStorage.getItem(HINT_DISMISSED_KEY)) this._renderHintBar();
  }

  private _makeCard(file: TFile, isCenter: boolean, isSuggested: boolean): NodeCard {
    const card = new NodeCard(this.app, { file, isCenter, isSuggested, onNavigate: this.onNavigate });
    card.getScale = () => this.scale;
    card.onDrag   = () => this._updateLines();
    this.parentComponent.addChild(card);
    this.activeCards.push(card);
    return card;
  }

  // ── lines ─────────────────────────────────────────────

  private _drawLine(
    from: { x: number; y: number },
    to:   { x: number; y: number }
  ): SVGLineElement {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    line.setAttribute("class", "gev-connection-line");
    this.svgEl.appendChild(line);
    return line;
  }

  private _updateLines(): void {
    if (!this.centerCard) return;
    const { x: cx, y: cy } = this.centerCard.getCenter();
    for (const card of this.activeCards) {
      if (card === this.centerCard) continue;
      const line = this.lineMap.get(card);
      if (!line) continue;
      const { x, y } = card.getCenter();
      line.setAttribute("x1", String(cx));
      line.setAttribute("y1", String(cy));
      line.setAttribute("x2", String(x));
      line.setAttribute("y2", String(y));
    }
  }

  // ── dot tray (overflow) ───────────────────────────────

  /**
   * Overflow files rendered as draggable pill chips, initially clustered
   * bottom-right so they stay out of the main card area. Each pill shows
   * the filename and can be individually dragged anywhere on the canvas.
   */
  private _renderDotTray(files: TFile[], w: number, h: number): void {
    const PILL_W    = 150;
    const PILL_H    = 26;
    const GAP       = 6;
    const COLS      = 3;
    const ORIGIN_X  = w - (PILL_W + GAP) * COLS + GAP;
    const ORIGIN_Y  = h - (Math.ceil(files.length / COLS)) * (PILL_H + GAP) - 20;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const col  = i % COLS;
      const row  = Math.floor(i / COLS);
      const px   = ORIGIN_X + col * (PILL_W + GAP);
      const py   = ORIGIN_Y + row * (PILL_H + GAP);

      const pill = this.canvasEl.createEl("div", { cls: "gev-dot-pill" });
      pill.title = file.basename;
      pill.style.left   = `${px}px`;
      pill.style.top    = `${py}px`;
      pill.style.width  = `${PILL_W}px`;

      // dot indicator
      pill.createEl("span", { cls: "gev-dot-pill__dot" });

      // filename label (truncated via CSS)
      pill.createEl("span", {
        cls:  "gev-dot-pill__name",
        text: file.basename,
      });

      // click → navigate
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onNavigate(file);
      });

      // drag (independent pill drag)
      this._makePillDraggable(pill);
    }
  }

  private _makePillDraggable(pill: HTMLElement): void {
    let startX = 0, startY = 0, origLeft = 0, origTop = 0, moved = false;

    const onMove = (e: MouseEvent) => {
      const scale = this.scale;
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      pill.style.left = `${origLeft + dx}px`;
      pill.style.top  = `${origTop  + dy}px`;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    pill.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      moved = false;
      startX   = e.clientX;
      startY   = e.clientY;
      origLeft = parseFloat(pill.style.left) || 0;
      origTop  = parseFloat(pill.style.top)  || 0;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // ── buttons / banners ─────────────────────────────────

  private _renderBackButton(): void {
    const btn = this.wrapperEl.createEl("button", {
      cls: "gev-back-btn", text: "← 戻る",
    });
    btn.addEventListener("click", (e) => { e.stopPropagation(); this.onBackClick!(); });
  }

  private _renderSuggestedBanner(): void {
    this.wrapperEl.createEl("div", {
      cls: "gev-suggested-banner",
      text: "リンクなし — 最近更新したノードを表示しています",
    });
  }

  private _renderHintBar(): void {
    const hint = this.wrapperEl.createEl("div", {
      cls: "gev-hint-bar",
      text: "タイトルドラッグ: 移動 | ダブルクリック: 中心に | − : 折り畳み | ✎: 編集 | ホイール: ズーム | 余白ドラッグ: パン | 余白クリック: グラフ表示",
    });
    hint.addEventListener("click", (e) => {
      e.stopPropagation();
      localStorage.setItem(HINT_DISMISSED_KEY, "1");
      hint.remove();
    });
  }

  // ── lifecycle ─────────────────────────────────────────

  private clearAll(): void {
    for (const card of this.activeCards) {
      this.parentComponent.removeChild(card);
      card.unload();
      card.el.remove();
    }
    this.activeCards = [];
    this.lineMap     = new WeakMap();
    this.centerCard  = null;

    while (this.svgEl.firstChild) this.svgEl.removeChild(this.svgEl.firstChild);

    // remove all canvas-level pills
    this.canvasEl.querySelectorAll(".gev-dot-pill").forEach((el) => el.remove());

    // remove wrapper-level overlays
    [".gev-more-btn", ".gev-back-btn", ".gev-hint-bar", ".gev-suggested-banner"]
      .forEach((sel) => this.wrapperEl.querySelector(sel)?.remove());
  }

  show(): void { this.wrapperEl.style.display = ""; }
  hide(): void { this.wrapperEl.style.display = "none"; }

  destroy(): void {
    document.removeEventListener("mousemove", this._boundPanMove);
    document.removeEventListener("mouseup",   this._boundPanUp);
    this.clearAll();
    this.wrapperEl.remove();
  }
}

// ── helpers ───────────────────────────────────────────

function computeCircularPositions(
  count: number,
  center: { x: number; y: number },
  radius: number
): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}
