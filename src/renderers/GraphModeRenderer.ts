import { App, TFile } from "obsidian";
import { GraphState, GraphNode, GraphEdge } from "../types";

export class GraphModeRenderer {
  private wrapperEl: HTMLElement;
  private svgEl: SVGSVGElement;

  constructor(
    private readonly app: App,
    containerEl: HTMLElement,
    private readonly onNodeClick: (file: TFile) => void
  ) {
    this.wrapperEl = containerEl.createEl("div", { cls: "gev-graph-wrapper" });
    this.svgEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    ) as SVGSVGElement;
    this.svgEl.classList.add("gev-graph-svg");
    this.wrapperEl.appendChild(this.svgEl);
  }

  render(state: GraphState): void {
    while (this.svgEl.firstChild)
      this.svgEl.removeChild(this.svgEl.firstChild);

    const w = this.wrapperEl.clientWidth || 800;
    const h = this.wrapperEl.clientHeight || 600;

    this.svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const allFiles = [state.centerFile, ...state.surroundingFiles, ...state.overflowFiles];
    const nodes = computeRadialLayout(allFiles, state.centerFile, w, h);
    const edges = buildEdges(this.app, nodes);

    for (const edge of edges) {
      this.drawEdge(edge);
    }
    for (const node of nodes) {
      this.drawNode(node);
    }
  }

  private drawNode(node: GraphNode): void {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const classes = ["gev-graph-node"];
    if (node.isCenter) classes.push("gev-graph-node--center");
    g.setAttribute("class", classes.join(" "));
    g.style.cursor = "pointer";

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", String(node.x));
    circle.setAttribute("cy", String(node.y));
    circle.setAttribute("r", node.isCenter ? "10" : "6");

    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    label.setAttribute("x", String(node.x));
    label.setAttribute("y", String(node.y + 18));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "gev-graph-label");
    label.textContent = node.file.basename;

    g.appendChild(circle);
    g.appendChild(label);

    g.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onNodeClick(node.file);
    });

    this.svgEl.appendChild(g);
  }

  private drawEdge(edge: GraphEdge): void {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(edge.source.x));
    line.setAttribute("y1", String(edge.source.y));
    line.setAttribute("x2", String(edge.target.x));
    line.setAttribute("y2", String(edge.target.y));
    line.setAttribute("class", "gev-graph-edge");
    this.svgEl.appendChild(line);
  }

  show(): void {
    this.wrapperEl.style.display = "";
  }

  hide(): void {
    this.wrapperEl.style.display = "none";
  }

  destroy(): void {
    this.wrapperEl.remove();
  }
}

function computeRadialLayout(
  files: TFile[],
  centerFile: TFile,
  w: number,
  h: number
): GraphNode[] {
  const cx = w / 2;
  const cy = h / 2;
  const surrounding = files.filter((f) => f.path !== centerFile.path);
  const radius = Math.min(w, h) * 0.38;

  return files.map((file) => {
    if (file.path === centerFile.path) {
      return { file, x: cx, y: cy, isCenter: true };
    }
    const idx = surrounding.indexOf(file);
    const angle = (2 * Math.PI * idx) / surrounding.length - Math.PI / 2;
    return {
      file,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      isCenter: false,
    };
  });
}

function buildEdges(app: App, nodes: GraphNode[]): GraphEdge[] {
  const nodeMap = new Map<string, GraphNode>(
    nodes.map((n) => [n.file.path, n])
  );
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const links = app.metadataCache.getFileCache(node.file)?.links ?? [];
    for (const link of links) {
      const targetFile = app.metadataCache.getFirstLinkpathDest(
        link.link,
        node.file.path
      );
      if (!targetFile) continue;
      const targetNode = nodeMap.get(targetFile.path);
      if (!targetNode) continue;

      const key = [node.file.path, targetFile.path].sort().join("||");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: node, target: targetNode });
    }
  }
  return edges;
}
