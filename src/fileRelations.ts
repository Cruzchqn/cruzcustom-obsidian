import { App, TFile } from "obsidian";

const MAX_SURROUNDING = 8;
const MAX_OVERFLOW_BEFORE_SEARCH = 20;

export interface RelationResult {
  surrounding: TFile[];
  overflow: TFile[];
  isSuggested: boolean;
}

export function getRelatedFiles(app: App, centerFile: TFile): RelationResult {
  const scored = new Map<string, { file: TFile; score: number }>();

  const outLinks = app.metadataCache.getFileCache(centerFile)?.links ?? [];
  for (const link of outLinks) {
    const resolved = app.metadataCache.getFirstLinkpathDest(
      link.link,
      centerFile.path
    );
    if (!resolved || resolved.path === centerFile.path) continue;
    const count =
      (app.metadataCache.resolvedLinks[centerFile.path]?.[resolved.path] ?? 0);
    const entry = scored.get(resolved.path);
    if (entry) {
      entry.score += count || 1;
    } else {
      scored.set(resolved.path, { file: resolved, score: count || 1 });
    }
  }

  const resolvedLinks = app.metadataCache.resolvedLinks;
  for (const sourcePath of Object.keys(resolvedLinks)) {
    if (sourcePath === centerFile.path) continue;
    const targets = resolvedLinks[sourcePath];
    if (!targets[centerFile.path]) continue;
    const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile)) continue;
    const backCount = targets[centerFile.path];
    const entry = scored.get(sourcePath);
    if (entry) {
      entry.score += backCount;
    } else {
      scored.set(sourcePath, { file: sourceFile, score: backCount });
    }
  }

  const sorted = [...scored.values()].sort((a, b) => b.score - a.score);

  if (sorted.length === 0) {
    return {
      surrounding: getRecentFiles(app, centerFile, 5),
      overflow: [],
      isSuggested: true,
    };
  }

  const surrounding = sorted.slice(0, MAX_SURROUNDING).map((e) => e.file);
  const overflow = sorted
    .slice(MAX_SURROUNDING, MAX_OVERFLOW_BEFORE_SEARCH)
    .map((e) => e.file);

  return { surrounding, overflow, isSuggested: false };
}

function getRecentFiles(app: App, exclude: TFile, count: number): TFile[] {
  return app.vault
    .getMarkdownFiles()
    .filter((f) => f.path !== exclude.path)
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, count);
}

export function getTodayFile(app: App): TFile {
  const today = window.moment().format("YYYY-MM-DD");
  const byPath = app.vault.getAbstractFileByPath(`${today}.md`);
  if (byPath instanceof TFile) return byPath;

  const byBasename = app.vault
    .getMarkdownFiles()
    .find((f) => f.basename === today);
  if (byBasename) return byBasename;

  const files = app.vault
    .getMarkdownFiles()
    .sort((a, b) => b.stat.mtime - a.stat.mtime);
  return files[0];
}

export function getAllRelatedForSearch(
  app: App,
  centerFile: TFile
): Array<{ file: TFile; score: number }> {
  const scored = new Map<string, { file: TFile; score: number }>();

  const outLinks = app.metadataCache.getFileCache(centerFile)?.links ?? [];
  for (const link of outLinks) {
    const resolved = app.metadataCache.getFirstLinkpathDest(
      link.link,
      centerFile.path
    );
    if (!resolved || resolved.path === centerFile.path) continue;
    const count =
      app.metadataCache.resolvedLinks[centerFile.path]?.[resolved.path] ?? 1;
    const entry = scored.get(resolved.path);
    if (entry) entry.score += count;
    else scored.set(resolved.path, { file: resolved, score: count });
  }

  const resolvedLinks = app.metadataCache.resolvedLinks;
  for (const sourcePath of Object.keys(resolvedLinks)) {
    if (sourcePath === centerFile.path) continue;
    const targets = resolvedLinks[sourcePath];
    if (!targets[centerFile.path]) continue;
    const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile)) continue;
    const backCount = targets[centerFile.path];
    const entry = scored.get(sourcePath);
    if (entry) entry.score += backCount;
    else scored.set(sourcePath, { file: sourceFile, score: backCount });
  }

  return [...scored.values()].sort((a, b) => b.score - a.score);
}
