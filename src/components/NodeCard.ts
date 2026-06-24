import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { NodeCardOptions } from "../types";

export class NodeCard extends Component {
  public el: HTMLElement;
  private readonly app: App;
  private readonly file: TFile;
  private readonly isCenter: boolean;
  private readonly isSuggested: boolean;
  private readonly onNavigate: (file: TFile) => void;

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

  async build(): Promise<void> {
    const titleEl = this.el.createEl("div", { cls: "gev-node-card__title" });
    titleEl.setText(this.file.basename);

    const contentEl = this.el.createEl("div", {
      cls: "gev-node-card__content",
    });

    try {
      const content = await this.app.vault.read(this.file);
      await MarkdownRenderer.render(
        this.app,
        content,
        contentEl,
        this.file.path,
        this
      );
    } catch {
      contentEl.setText("(読み込みエラー)");
    }

    if (!this.isCenter) {
      this.el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onNavigate(this.file);
      });
    }
  }
}
