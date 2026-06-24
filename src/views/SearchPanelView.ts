import { TFile } from "obsidian";

interface SearchItem {
  file: TFile;
  score: number;
}

export class SearchPanelView {
  private wrapperEl: HTMLElement;
  private listEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private items: SearchItem[] = [];

  constructor(
    containerEl: HTMLElement,
    private readonly onSelect: (file: TFile) => void,
    private readonly onBack: () => void
  ) {
    this.wrapperEl = containerEl.createEl("div", {
      cls: "gev-search-panel",
    });
    this.build();
  }

  private build(): void {
    const header = this.wrapperEl.createEl("div", {
      cls: "gev-search-panel__header",
    });

    const backBtn = header.createEl("button", {
      cls: "gev-search-panel__back",
      text: "← 戻る",
    });
    backBtn.addEventListener("click", () => this.onBack());

    const title = header.createEl("span", {
      cls: "gev-search-panel__title",
      text: "関連ノード",
    });
    title.style.marginLeft = "12px";

    this.inputEl = this.wrapperEl.createEl("input", {
      cls: "gev-search-panel__input",
      type: "text",
      placeholder: "ファイル名で検索...",
    }) as HTMLInputElement;

    this.inputEl.addEventListener("input", () => {
      this.filterList(this.inputEl.value);
    });

    this.listEl = this.wrapperEl.createEl("div", {
      cls: "gev-search-panel__list",
    });
  }

  setItems(items: SearchItem[]): void {
    this.items = items;
    this.renderList(items);
  }

  private filterList(query: string): void {
    const lower = query.toLowerCase();
    const filtered = lower
      ? this.items.filter((item) =>
          item.file.basename.toLowerCase().includes(lower)
        )
      : this.items;
    this.renderList(filtered);
  }

  private renderList(items: SearchItem[]): void {
    this.listEl.empty();
    for (const item of items) {
      const row = this.listEl.createEl("div", {
        cls: "gev-search-panel__item",
      });

      const dot = row.createEl("span", { cls: "gev-search-panel__dot" });

      const name = row.createEl("span", {
        cls: "gev-search-panel__name",
        text: item.file.basename,
      });

      const score = row.createEl("span", {
        cls: "gev-search-panel__score",
        text: `(links: ${item.score})`,
      });

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(score);

      row.addEventListener("click", () => this.onSelect(item.file));
    }
  }

  show(): void {
    this.wrapperEl.style.display = "";
    this.inputEl.value = "";
    this.filterList("");
    this.inputEl.focus();
  }

  hide(): void {
    this.wrapperEl.style.display = "none";
  }

  destroy(): void {
    this.wrapperEl.remove();
  }
}
