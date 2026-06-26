import { addIcon, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
  GraphEvolutionView,
  VIEW_TYPE_GRAPH_EVOLUTION,
} from "./views/GraphEvolutionView";

// Radial graph icon: center node + 5 surrounding nodes + spokes
const GEV_ICON_SVG = `
<circle cx="50" cy="50" r="11" fill="currentColor"/>
<circle cx="50" cy="14" r="6.5" fill="currentColor" opacity=".65"/>
<circle cx="83" cy="32" r="6.5" fill="currentColor" opacity=".65"/>
<circle cx="83" cy="68" r="6.5" fill="currentColor" opacity=".65"/>
<circle cx="50" cy="86" r="6.5" fill="currentColor" opacity=".65"/>
<circle cx="17" cy="50" r="6.5" fill="currentColor" opacity=".65"/>
<line x1="50" y1="50" x2="50" y2="20"  stroke="currentColor" stroke-width="2.5" opacity=".4"/>
<line x1="50" y1="50" x2="77" y2="36"  stroke="currentColor" stroke-width="2.5" opacity=".4"/>
<line x1="50" y1="50" x2="77" y2="64"  stroke="currentColor" stroke-width="2.5" opacity=".4"/>
<line x1="50" y1="50" x2="50" y2="80"  stroke="currentColor" stroke-width="2.5" opacity=".4"/>
<line x1="50" y1="50" x2="23" y2="50"  stroke="currentColor" stroke-width="2.5" opacity=".4"/>
`;

export default class GraphEvolutionPlugin extends Plugin {
  private lastFilePath: string | null = null;

  async onload(): Promise<void> {
    // Register custom icon
    addIcon("gev-graph", GEV_ICON_SVG);

    // Restore last opened file from saved data
    const data = await this.loadData();
    this.lastFilePath = data?.lastFile ?? null;

    // Track last opened MD file
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.lastFilePath = file.path;
          this.saveData({ lastFile: file.path });
        }
      })
    );

    this.registerView(
      VIEW_TYPE_GRAPH_EVOLUTION,
      (leaf: WorkspaceLeaf) =>
        new GraphEvolutionView(leaf, this.app, () => this.lastFilePath)
    );

    this.addRibbonIcon("gev-graph", "Graph View Evolution", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-graph-evolution",
      name: "Open Graph View Evolution",
      callback: () => this.activateView(),
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GRAPH_EVOLUTION);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_GRAPH_EVOLUTION)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE_GRAPH_EVOLUTION,
        active: true,
      });
    }
    workspace.revealLeaf(leaf);
  }
}
