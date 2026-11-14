// Minimal typings for the parts of the vendored dagre build that the board generator uses.
export interface GraphLabel {
  rankdir?: "TB" | "BT" | "LR" | "RL";
  nodesep?: number;
  edgesep?: number;
  ranksep?: number;
  marginx?: number;
  marginy?: number;
  ranker?: "network-simplex" | "tight-tree" | "longest-path";
  align?: "UL" | "UR" | "DL" | "DR";
  compound?: boolean;
  width?: number;
  height?: number;
}
export interface NodeLabel {
  width: number;
  height: number;
  x?: number;
  y?: number;
  [key: string]: unknown;
}
export interface EdgeLabel {
  minlen?: number;
  weight?: number;
  width?: number;
  height?: number;
  labelpos?: "l" | "c" | "r";
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  [key: string]: unknown;
}
export declare class Graph {
  constructor(opts?: { directed?: boolean; multigraph?: boolean; compound?: boolean });
  setGraph(label: GraphLabel): Graph;
  graph(): GraphLabel;
  setDefaultEdgeLabel(fn: () => EdgeLabel): Graph;
  setNode(id: string, label?: NodeLabel): Graph;
  node(id: string): NodeLabel;
  hasNode(id: string): boolean;
  setParent(id: string, parent?: string): Graph;
  setEdge(v: string, w: string, label?: EdgeLabel, name?: string): Graph;
  edge(v: string, w: string, name?: string): EdgeLabel;
  nodes(): string[];
}
export declare function layout(graph: Graph): void;
declare const dagre: { layout: typeof layout; graphlib: { Graph: typeof Graph } };
export default dagre;
