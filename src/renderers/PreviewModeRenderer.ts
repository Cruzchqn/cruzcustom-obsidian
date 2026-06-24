import { App, Component, TFile } from "obsidian";
import { GraphState } from "../types";
import { NodeCard } from "../components/NodeCard";

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
    private readonly onOverflowDotClick: (file: TFile) => void
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

    this.wrapperEl.addEventListener("mousedown", (e) => {
      const target = e.target as Element;
      if (
        target === this.wrapperEl ||
        target === this.svgEl ||
        target.classList.contains("gev-svg-overlay")
      ) {
        this.onBackgroundClick();
      }
    });
  }

  async render(state: GraphState): Promise<void> {
    this.clearCards();
    while (this.svgEl.firstChild) this.svgEl.removeChild(this.svgEl.firstChild);

    const w = this.wrapperEl.clientWidth || 800;
    const h = this.wrapperEl.clientHeight || 600;
    const centerPos = { x: w / 2, y: h / 2 };
    const radius = Math.min(w, h) * 0.34;

    const surroundCount = state.surroundingFiles.length;
    const surroundPositions = computeCircularPositions(
      surroundCount,
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
      this.renderOverflowDots(
        state.overflowFiles,
        centerPos,
        radius,
        w,
        h
      );
    }

    const totalOverflow =
      state.overflowFiles.length > 0 ? state.overflowFiles.length : 0;
    const hasSearchMode =
      totalOverflow >= 20 - 8;

    if (hasSearchMode && state.overflowFiles.length >= 12) {
      this.renderMoreButton(state, w, h);
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

  private renderMoreButton(
    state: GraphState,
    w: number,
    h: number
  ): void {
    const btn = this.wrapperEl.createEl("button", {
      cls: "gev-more-btn",
      text: `もっと見る (+${state.overflowFiles.length} 件)`,
    });
    btn.style.position = "absolute";
    btn.style.bottom = "16px";
    btn.style.right = "16px";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onBackgroundClick();
    });
  }

  private clearCards(): void {
    for (const card of this.activeCards) {
      this.parentComponent.removeChild(card);
      card.unload();
      card.el.remove();
    }
    this.activeCards = [];

    const moreBtn = this.wrapperEl.querySelector(".gev-more-btn");
    if (moreBtn) moreBtn.remove();
  }

  show(): void {
    this.wrapperEl.style.display = "";
  }

  hide(): void {
    this.wrapperEl.style.display = "none";
  }

  destroy(): void {
    this.clearCards();
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
