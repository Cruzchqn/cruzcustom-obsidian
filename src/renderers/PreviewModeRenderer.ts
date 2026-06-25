import { App, Component, TFile } from "obsidian";
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

  // pan drag state
  private panning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panOriginX = 0;
  private panOriginY = 0;

  // bound handlers for cleanup
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundMouseUp: (e: MouseEvent) => void;

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

    // canvas layer — all cards and lines live here, transforms applied here
    this.canvasEl = this.wrapperEl.createEl("div", { cls: "gev-canvas" });

    this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    this.svgEl.classList.add("gev-svg-overlay");
    this.canvasEl.appendChild(this.svgEl);

    this._boundMouseMove = this._onPanMove.bind(this);
    this._boundMouseUp = this._onPanUp.bind(this);

    this._setupPanZoom();
  }

  // ── pan/zoom ──────────────────────────────────────────────

  private _applyTransform(): void {
    this.canvasEl.style.transform =
      `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  private _setupPanZoom(): void {
    // scroll to zoom toward cursor
    this.wrapperEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(3, Math.max(0.15, this.scale * factor));
      const rect = this.wrapperEl.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cursorCX = (cx - this.panX) / this.scale;
      const cursorCY = (cy - this.panY) / this.scale;
      this.panX = cx - cursorCX * newScale;
      this.panY = cy - cursorCY * newScale;
      this.scale = newScale;
      this._applyTransform();
    }, { passive: false });

    // background drag to pan
    this.wrapperEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      if (this._isInteractable(target)) return;

      this.panning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panOriginX = this.panX;
      this.panOriginY = this.panY;
      this.wrapperEl.style.cursor = "grabbing";

      document.addEventListener("mousemove", this._boundMouseMove);
      document.addEventListener("mouseup", this._boundMouseUp);
    });

    // click on background → switch to graph mode (only if not panning)
    this.wrapperEl.addEventListener("click", (e) => {
      const target = e.target as Element;
      if (!this._isInteractable(target)) {
        this.onBackgroundClick();
      }
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
    document.removeEventListener("mousemove", this._boundMouseMove);
    document.removeEventListener("mouseup", this._boundMouseUp);

    // suppress background click if it was a real pan
    if (moved > 5) {
      e.stopImmediatePropagation();
    }
  }

  private _isInteractable(target: Element): boolean {
    return !!(
      target.closest(".gev-node-card") ||
      target.closest(".gev-overflow-dot") ||
      target.closest(".gev-more-btn") ||
      target.closest(".gev-back-btn") ||
      target.closest(".gev-hint-bar") ||
      target.closest(".gev-suggested-banner")
    );
  }

  // ── render ────────────────────────────────────────────────

  async render(state: GraphState): Promise<void> {
    this.clearAll();

    const w = this.wrapperEl.clientWidth || 800;
    const h = this.wrapperEl.clientHeight || 600;
    const centerPos = { x: w / 2, y: h / 2 };
    const radius = Math.min(w, h) * 0.34;

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
    const surroundCards = state.surroundingFiles.map((file) =>
      this._makeCard(file, false, state.isSuggested)
    );

    await Promise.all([centerCard, ...surroundCards].map((c) => c.build()));

    centerCard.setPosition(centerPos.x, centerPos.y);
    this.canvasEl.appendChild(centerCard.el);

    for (let i = 0; i < surroundCards.length; i++) {
      const card = surroundCards[i];
      card.setPosition(surroundPositions[i].x, surroundPositions[i].y);
      this.canvasEl.appendChild(card.el);

      if (!state.isSuggested) {
        const line = this._drawLine(centerPos, surroundPositions[i]);
        this.lineMap.set(card, line);
      }
    }

    if (state.overflowFiles.length > 0) {
      this._renderOverflowDots(state.overflowFiles, centerPos, radius, w, h);
    }

    if (state.overflowFiles.length >= 12) {
      this._renderMoreButton(state);
    }

    if (this.onBackClick) {
      this._renderBackButton();
    }

    if (state.isSuggested) {
      this._renderSuggestedBanner();
    }

    if (!localStorage.getItem(HINT_DISMISSED_KEY)) {
      this._renderHintBar();
    }
  }

  private _makeCard(file: TFile, isCenter: boolean, isSuggested: boolean): NodeCard {
    const card = new NodeCard(this.app, { file, isCenter, isSuggested, onNavigate: this.onNavigate });
    card.getScale = () => this.scale;
    card.onDrag = () => this._updateLines();
    this.parentComponent.addChild(card);
    this.activeCards.push(card);
    return card;
  }

  private _updateLines(): void {
    if (!this.centerCard) return;
    const cx = this.centerCard.x;
    const cy = this.centerCard.y;
    for (const card of this.activeCards) {
      if (card === this.centerCard) continue;
      const line = this.lineMap.get(card);
      if (!line) continue;
      line.setAttribute("x1", String(cx));
      line.setAttribute("y1", String(cy));
      line.setAttribute("x2", String(card.x));
      line.setAttribute("y2", String(card.y));
    }
  }

  private _drawLine(
    from: { x: number; y: number },
    to: { x: number; y: number }
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

  // ── overflow / buttons ────────────────────────────────────

  private _renderOverflowDots(
    files: TFile[],
    center: { x: number; y: number },
    innerRadius: number,
    w: number,
    h: number
  ): void {
    const outerRadius = Math.min(w, h) * 0.48;
    const positions = computeCircularPositions(files.length, center, outerRadius);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pos = positions[i];

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "gev-overflow-dot");
      g.style.cursor = "pointer";
      g.style.pointerEvents = "all";

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(pos.x));
      circle.setAttribute("cy", String(pos.y));
      circle.setAttribute("r", "5");
      circle.setAttribute("class", "gev-overflow-dot__circle");

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = file.basename;

      g.appendChild(circle);
      g.appendChild(title);

      g.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onOverflowDotClick(file);
      });

      this.svgEl.appendChild(g);
    }
  }

  private _renderMoreButton(state: GraphState): void {
    const btn = this.wrapperEl.createEl("button", {
      cls: "gev-more-btn",
      text: `もっと見る (+${state.overflowFiles.length} 件)`,
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onMoreClick();
    });
  }

  private _renderBackButton(): void {
    const btn = this.wrapperEl.createEl("button", {
      cls: "gev-back-btn",
      text: "← 戻る",
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onBackClick!();
    });
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
      text: "タイトルドラッグ: 移動 | ダブルクリック: 中心に | − : 折り畳み | ホイール: ズーム | 余白ドラッグ: パン | 余白クリック: グラフ表示",
    });
    hint.addEventListener("click", (e) => {
      e.stopPropagation();
      localStorage.setItem(HINT_DISMISSED_KEY, "1");
      hint.remove();
    });
  }

  // ── lifecycle ─────────────────────────────────────────────

  private clearAll(): void {
    for (const card of this.activeCards) {
      this.parentComponent.removeChild(card);
      card.unload();
      card.el.remove();
    }
    this.activeCards = [];
    this.lineMap = new WeakMap();
    this.centerCard = null;

    while (this.svgEl.firstChild) this.svgEl.removeChild(this.svgEl.firstChild);

    for (const cls of [
      ".gev-more-btn",
      ".gev-back-btn",
      ".gev-hint-bar",
      ".gev-suggested-banner",
    ]) {
      this.wrapperEl.querySelector(cls)?.remove();
    }
  }

  show(): void { this.wrapperEl.style.display = ""; }
  hide(): void { this.wrapperEl.style.display = "none"; }

  destroy(): void {
    document.removeEventListener("mousemove", this._boundMouseMove);
    document.removeEventListener("mouseup", this._boundMouseUp);
    this.clearAll();
    this.wrapperEl.remove();
  }
}

// ── helpers ───────────────────────────────────────────────

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
