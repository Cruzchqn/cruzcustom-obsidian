import { App, ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { GraphState, ViewMode } from "../types";
import { getRelatedFiles, getTodayFile, getAllRelatedForSearch } from "../fileRelations";
import { PreviewModeRenderer } from "../renderers/PreviewModeRenderer";
import { GraphModeRenderer } from "../renderers/GraphModeRenderer";
import { SearchPanelView } from "./SearchPanelView";

export const VIEW_TYPE_GRAPH_EVOLUTION = "graph-evolution-view";

export class GraphEvolutionView extends ItemView {
  private state!: GraphState;
  private previewRenderer!: PreviewModeRenderer;
  private graphRenderer!: GraphModeRenderer;
  private searchPanel!: SearchPanelView;

  constructor(leaf: WorkspaceLeaf, private readonly obsidianApp: App) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_GRAPH_EVOLUTION;
  }

  getDisplayText(): string {
    return "Graph Evolution";
  }

  getIcon(): string {
    return "git-fork";
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.addClass("gev-container");

    this.previewRenderer = new PreviewModeRenderer(
      this.obsidianApp,
      container,
      this,
      (file) => this.navigateTo(file),
      () => this.switchMode("graph"),
      (file) => this.navigateTo(file)
    );

    this.graphRenderer = new GraphModeRenderer(
      this.obsidianApp,
      container,
      (file) => this.navigateTo(file)
    );

    this.searchPanel = new SearchPanelView(
      container,
      (file) => this.navigateTo(file),
      () => this.switchMode("preview")
    );

    const initialFile = getTodayFile(this.obsidianApp);
    this.setState(initialFile, "preview");
    await this.render();
  }

  async onClose(): Promise<void> {
    this.previewRenderer.destroy();
    this.graphRenderer.destroy();
    this.searchPanel.destroy();
  }

  private setState(centerFile: TFile, mode: ViewMode): void {
    const { surrounding, overflow, isSuggested } = getRelatedFiles(
      this.obsidianApp,
      centerFile
    );
    this.state = { mode, centerFile, surroundingFiles: surrounding, overflowFiles: overflow, isSuggested };
  }

  private navigateTo(file: TFile): void {
    this.setState(file, "preview");
    this.render();
  }

  private switchMode(mode: ViewMode): void {
    if (mode === "search") {
      const allRelated = getAllRelatedForSearch(
        this.obsidianApp,
        this.state.centerFile
      );
      this.previewRenderer.hide();
      this.graphRenderer.hide();
      this.searchPanel.setItems(allRelated);
      this.searchPanel.show();
      this.state = { ...this.state, mode: "search" };
      return;
    }
    this.state = { ...this.state, mode };
    this.render();
  }

  private async render(): Promise<void> {
    const { mode } = this.state;

    if (mode === "preview") {
      this.graphRenderer.hide();
      this.searchPanel.hide();
      this.previewRenderer.show();
      await this.previewRenderer.render(this.state);
    } else if (mode === "graph") {
      this.previewRenderer.hide();
      this.searchPanel.hide();
      this.graphRenderer.show();
      this.graphRenderer.render(this.state);
    }
  }
}
