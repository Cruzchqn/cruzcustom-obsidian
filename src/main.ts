import { Plugin, WorkspaceLeaf } from "obsidian";
import {
  GraphEvolutionView,
  VIEW_TYPE_GRAPH_EVOLUTION,
} from "./views/GraphEvolutionView";

export default class GraphEvolutionPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_GRAPH_EVOLUTION,
      (leaf: WorkspaceLeaf) => new GraphEvolutionView(leaf, this.app)
    );

    this.addRibbonIcon("git-fork", "Graph View Evolution", () => {
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
