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

  // U3: navigation history
  private history: TFile[] = [];

  // B6: render lock
  private isRendering = false;
  private pendingFile: TFile | null = null;

  // U4: resize observer
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly obsidianApp: App,
    private readonly getLastFilePath: () => string | null = () => null
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_GRAPH_EVOLUTION;
  }

  getDisplayText(): string {
    return "Graph Evolution";
  }

  getIcon(): string {
    return "gev-graph";
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
      (file) => this.navigateTo(file),
      // B1: onMoreClick → opens search panel
      () => this.switchMode("search"),
      // U3: back button callback (null = no history yet)
      null
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

    // Initial file: last opened → active editor → most-recently-modified
    const lastPath = this.getLastFilePath();
    const lastFile = lastPath
      ? this.obsidianApp.vault.getAbstractFileByPath(lastPath)
      : null;
    const initialFile =
      (lastFile instanceof TFile ? lastFile : null) ??
      this.obsidianApp.workspace.getActiveFile() ??
      getTodayFile(this.obsidianApp);

    if (!initialFile) {
      this.showEmptyState(container);
      return;
    }

    this.setState(initialFile, "preview");

    // B3: defer first render until DOM layout is complete
    window.requestAnimationFrame(() => {
      this.render();
    });

    // U4: resize observer with 100ms debounce
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.resizeTimer = null;
        if (this.state.mode === "preview" || this.state.mode === "graph") {
          this.render();
        }
      }, 100);
    });
    this.resizeObserver.observe(container);
  }

  async onClose(): Promise<void> {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }
    this.previewRenderer?.destroy();
    this.graphRenderer?.destroy();
    this.searchPanel?.destroy();
  }

  private showEmptyState(container: HTMLElement): void {
    const el = container.createEl("div", { cls: "gev-empty-state" });
    el.createEl("p", { text: "Markdown ファイルが見つかりません。" });
    el.createEl("p", { text: "まずノートを作成してください。" });
  }

  private setState(centerFile: TFile, mode: ViewMode): void {
    const { surrounding, overflow, isSuggested } = getRelatedFiles(
      this.obsidianApp,
      centerFile
    );
    this.state = {
      mode,
      centerFile,
      surroundingFiles: surrounding,
      overflowFiles: overflow,
      isSuggested,
    };
  }

  // U3: rebuild renderer with correct back callback
  private rebuildPreviewRenderer(container: HTMLElement): void {
    this.previewRenderer.destroy();
    this.previewRenderer = new PreviewModeRenderer(
      this.obsidianApp,
      container,
      this,
      (file) => this.navigateTo(file),
      () => this.switchMode("graph"),
      (file) => this.navigateTo(file),
      () => this.switchMode("search"),
      this.history.length > 0 ? () => this.navigateBack() : null
    );
  }

  // B6: async navigateTo with render lock
  private async navigateTo(file: TFile): Promise<void> {
    if (this.isRendering) {
      // Queue the latest navigation request, drop intermediate ones
      this.pendingFile = file;
      return;
    }

    if (this.state) {
      this.history.push(this.state.centerFile);
    }

    this.setState(file, "preview");
    this.rebuildPreviewRenderer(this.contentEl);
    await this.render();

    // Process any pending navigation that arrived while rendering
    if (this.pendingFile) {
      const next = this.pendingFile;
      this.pendingFile = null;
      await this.navigateTo(next);
    }
  }

  // U3: go back in history
  private async navigateBack(): Promise<void> {
    const prev = this.history.pop();
    if (!prev) return;
    this.setState(prev, "preview");
    this.rebuildPreviewRenderer(this.contentEl);
    await this.render();
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
    if (this.isRendering) return;
    this.isRendering = true;
    try {
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
    } finally {
      this.isRendering = false;
    }
  }
}
