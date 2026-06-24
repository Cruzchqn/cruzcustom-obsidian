import { App, Component, TFile } from "obsidian";
import { GraphState } from "../types";
import { NodeCard } from "../components/NodeCard";

const HINT_DISMISSED_KEY = "gev-hint-dismissed";

export class PreviewModeRenderer extends Component {
  private wrapperEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private activeCards: NodeCard[] = [];

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
    this.wrapperEl = containerEl.createEl("div", {
      cls: "gev-preview-wrapper",
    });

    this.svgEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    ) as SVGSVGElement;
    this.svgEl.classList.add("gev-svg-overlay");
    this.wrapperEl.appendChild(this.svgEl);

    // B4: use click (not mousedown) and check .closest() to avoid conflicts
    this.wrapperEl.addEventListener("click", (e) => {
      const target = e.target as Element;
      if (
        !target.closest(".gev-node-card") &&
        !target.closest(".gev-overflow-dot") &&
        !target.closest(".gev-more-btn") &&
        !target.closest(".gev-back-btn") &&
        !target.closest(".gev-hint-bar") &&
        !target.closest(".gev-suggested-banner")
      ) {
        this.onBackgroundClick();
      }
    });
  }

  async render(state: GraphState): Promise<void> {
    this.clearAll();
    while (this.svgEl.firstChild) this.svgEl.removeChild(this.svgEl.firstChild);

    const w = this.wrapperEl.clientWidth || 800;
    const h = this.wrapperEl.clientHeight || 600;
    const centerPos = { x: w / 2, y: h / 2 };
    const radius = Math.min(w, h) * 0.34;

    const surroundPositions = computeCircularPositions(
      state.surroundingFiles.length,
      centerPos,
      radius
    );

    const centerCard = new NodeCard(this.app, {
      file: state.centerFile,
      isCenter: true,
      isSuggested: false,
      onNavigate: this.onNavigate,
    });
    this.parentComponent.addChild(centerCard);
    this.activeCards.push(centerCard);

    const surroundCards = state.surroundingFiles.map((file) => {
      const card = new NodeCard(this.app, {
        file,
        isCenter: false,
        isSuggested: state.isSuggested,
        onNavigate: this.onNavigate,
      });
      this.parentComponent.addChild(card);
      this.activeCards.push(card);
      return card;
    });

    await Promise.all([centerCard, ...surroundCards].map((c) => c.build()));

    positionCard(centerCard.el, centerPos);
    this.wrapperEl.appendChild(centerCard.el);

    for (let i = 0; i < surroundCards.length; i++) {
      positionCard(surroundCards[i].el, surroundPositions[i]);
      this.wrapperEl.appendChild(surroundCards[i].el);

      if (!state.isSuggested) {
        drawLine(this.svgEl, centerPos, surroundPositions[i]);
      }
    }

    if (state.overflowFiles.length > 0) {
      this.renderOverflowDots(state.overflowFiles, centerPos, radius, w, h);
    }

    // B1: "もっと見る" uses onMoreClick (not onBackgroundClick)
    if (state.overflowFiles.length >= 12) {
      this.renderMoreButton(state);
    }

    // U3: back button
    if (this.onBackClick) {
      this.renderBackButton();
    }

    // U6: suggested banner
    if (state.isSuggested) {
      this.renderSuggestedBanner();
    }

    // U1: hint bar (first-time only)
    if (!localStorage.getItem(HINT_DISMISSED_KEY)) {
      this.renderHintBar();
    }
  }

  private renderOverflowDots(
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
      // B2: override SVG-level pointer-events so dots are clickable
      g.style.pointerEvents = "all";

      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      circle.setAttribute("cx", String(pos.x));
      circle.setAttribute("cy", String(pos.y));
      circle.setAttribute("r", "5");
      circle.setAttribute("class", "gev-overflow-dot__circle");

      const title = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "title"
      );
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

  private renderMoreButton(state: GraphState): void {
    const btn = this.wrapperEl.createEl("button", {
      cls: "gev-more-btn",
      text: `もっと見る (+${state.overflowFiles.length} 件)`,
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // B1: was incorrectly calling onBackgroundClick; now calls onMoreClick
      this.onMoreClick();
    });
  }

  private renderBackButton(): void {
    const btn = this.wrapperEl.createEl("button", {
      cls: "gev-back-btn",
      text: "← 戻る",
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onBackClick!();
    });
  }

  private renderSuggestedBanner(): void {
    this.wrapperEl.createEl("div", {
      cls: "gev-suggested-banner",
      text: "リンクなし — 最近更新したノードを表示しています",
    });
  }

  private renderHintBar(): void {
    const hint = this.wrapperEl.createEl("div", {
      cls: "gev-hint-bar",
      text: "周囲カードをクリック: 移動　余白をクリック: グラフ表示　✕ で閉じる",
    });
    hint.addEventListener("click", (e) => {
      e.stopPropagation();
      localStorage.setItem(HINT_DISMISSED_KEY, "1");
      hint.remove();
    });
  }

  private clearAll(): void {
    for (const card of this.activeCards) {
      this.parentComponent.removeChild(card);
      card.unload();
      card.el.remove();
    }
    this.activeCards = [];

    // remove all non-SVG UI elements added by render()
    for (const cls of [
      ".gev-more-btn",
      ".gev-back-btn",
      ".gev-hint-bar",
      ".gev-suggested-banner",
    ]) {
      this.wrapperEl.querySelector(cls)?.remove();
    }
  }

  show(): void {
    this.wrapperEl.style.display = "";
  }

  hide(): void {
    this.wrapperEl.style.display = "none";
  }

  destroy(): void {
    this.clearAll();
    this.wrapperEl.remove();
  }
}

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

function positionCard(
  el: HTMLElement,
  pos: { x: number; y: number }
): void {
  el.style.position = "absolute";
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.style.transform = "translate(-50%, -50%)";
}

function drawLine(
  svg: SVGSVGElement,
  from: { x: number; y: number },
  to: { x: number; y: number }
): void {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(from.x));
  line.setAttribute("y1", String(from.y));
  line.setAttribute("x2", String(to.x));
  line.setAttribute("y2", String(to.y));
  line.setAttribute("class", "gev-connection-line");
  svg.appendChild(line);
}
