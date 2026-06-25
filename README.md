# Graph View Evolution

An [Obsidian](https://obsidian.md) plugin that replaces the default graph view with a canvas-style radial layout. Open any note and see its linked files rendered as floating preview cards — no physics simulation, no hairball.

![Graph View Evolution](https://github.com/Cruzchqn/cruzcustom-obsidian/raw/main/docs/screenshot.png)

## Features

- **Radial preview cards** — center note surrounded by linked notes, all showing live Markdown content
- **Pan & zoom** — drag the background to pan, scroll wheel to zoom (0.15×–3×), zoom toward cursor
- **Drag cards** — grab any card's title bar to reposition it freely
- **Collapse** — click `−` on surrounding cards to shrink them to a pill
- **Double-click title** — jump to that note as the new center
- **Inline edit** — click `✎` on the center card to edit raw Markdown in-place (Ctrl+S to save, Esc to close)
- **Edge resize** — drag the right / bottom / corner edge of any card to resize it
- **Overflow pills** — files beyond the visible ring appear as draggable filename pills clustered in the bottom-right; click any pill to navigate
- **Right-click context menu** (on cards): センターに設定 / 新しいタブで開く / `[[リンク]]` をコピー / リンクされた新規ノートを作成
- **Right-click background**: この位置に新規ノートを作成

## Installation

### Manual

1. Download the [latest release](https://github.com/Cruzchqn/cruzcustom-obsidian/releases) (`main.js`, `manifest.json`, `styles.css`)
2. Copy them to `<vault>/.obsidian/plugins/graph-view-evolution/`
3. Enable the plugin in **Settings → Community plugins**

### From source

```bash
git clone https://github.com/Cruzchqn/cruzcustom-obsidian
cd cruzcustom-obsidian
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` into your vault's plugin folder.

## Usage

Click the **graph icon** in the left ribbon, or run **"Graph View Evolution: Open"** from the command palette.

| Action | How |
|--------|-----|
| Pan | Drag background |
| Zoom | Scroll wheel |
| Move card | Drag title bar |
| Jump to note | Double-click title bar, or click surrounding card |
| Collapse card | Click `−` in title bar |
| Edit center note | Click `✎` in title bar |
| Resize card | Drag right / bottom / corner edge |
| Context menu | Right-click any card |

## Development

Built with TypeScript + esbuild. Targets Obsidian ≥ 1.4.0, desktop only.

```bash
npm run build   # production build
npm run dev     # watch mode
```

## License

MIT — see [LICENSE](LICENSE)
