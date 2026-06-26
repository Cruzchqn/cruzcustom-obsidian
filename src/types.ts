import { TFile } from "obsidian";

export type ViewMode = "preview" | "graph" | "search";

export interface GraphState {
  mode: ViewMode;
  centerFile: TFile;
  surroundingFiles: TFile[];
  overflowFiles: TFile[];
  sameDirFiles: TFile[];
  isSuggested: boolean;
}

export interface GraphNode {
  file: TFile;
  x: number;
  y: number;
  isCenter: boolean;
}

export interface GraphEdge {
  source: GraphNode;
  target: GraphNode;
}

export interface NodeCardOptions {
  file: TFile;
  isCenter: boolean;
  isSuggested: boolean;
  onNavigate: (file: TFile) => void;
  centerFile?: TFile | null;
}
