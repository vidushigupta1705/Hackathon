export type ParamInfo = {
  name: string;
  type: string;
  optional: boolean;
  hasDefault: boolean;
  rest: boolean;
};

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "enum"
  | "route";

export interface SymbolInfo {
  name: string; // qualified, e.g. UserService.get or "GET /users/:id"
  kind: SymbolKind;
  file: string;
  line: number;
  exported: boolean;
  params: ParamInfo[];
  returnType: string;
  async: boolean;
  signature: string;
  fields?: { name: string; type: string; optional: boolean }[];
  bodyHash?: string;
  handler?: string; // for routes: named handler function
  route?: { method: string; path: string };
}

export interface ImportInfo {
  module: string;
  named: { name: string; alias: string }[];
  default?: string;
  namespace?: string;
  line: number;
  text: string;
}

export interface CallInfo {
  name: string;
  object?: string;
  objectType?: string;
  isNew: boolean;
  enclosing: string;
  line: number;
  text: string;
  args: { text: string; type: string }[];
  usesResult: boolean;
  assignedTo?: string;
}

export interface HttpCallInfo {
  method: string;
  path: string;
  enclosing: string;
  line: number;
  text: string;
}

export interface ParsedFile {
  path: string;
  isTest: boolean;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  calls: CallInfo[];
  httpCalls: HttpCallInfo[];
  propAccess: string[];
  typeRefs: string[];
  pkg?: {
    name?: string;
    version?: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

export interface RepoInput {
  id: number;
  name: string;
  fullName: string;
  packageName: string | null;
  files: ParsedFile[];
}

export type Severity = "critical" | "high" | "medium" | "low";
export type Verdict = "confirmed_breaking" | "potential_risk" | "non_breaking";

export type ChangeKind =
  | "function_added"
  | "function_removed"
  | "function_renamed"
  | "function_modified"
  | "type_removed"
  | "export_removed"
  | "param_added_required"
  | "param_added_optional"
  | "param_removed"
  | "param_type_changed"
  | "param_renamed"
  | "param_made_required"
  | "return_type_changed"
  | "route_added"
  | "route_removed"
  | "route_changed"
  | "type_field_removed"
  | "type_field_added"
  | "type_field_changed"
  | "dep_added"
  | "dep_removed"
  | "dep_version_changed";

export interface Change {
  id: string;
  kind: ChangeKind;
  repoId: number;
  file: string;
  symbol: string;
  symbolKind: SymbolKind | "dependency";
  line: number;
  inherent: "breaking" | "risky" | "safe";
  summary: string;
  detail: Record<string, string | number | boolean | undefined>;
  oldSym?: SymbolInfo;
  newSym?: SymbolInfo;
  verdict?: Verdict;
}

export interface Finding {
  id: string;
  changeId: string;
  repoId: number;
  repoName: string;
  file: string;
  line: number;
  symbol: string;
  text: string;
  edgeKind: string;
  verdict: "confirmed" | "potential";
  reason: string;
  confidence: number;
  severity: Severity;
}

export interface AffectedNode {
  repoId: number;
  repoName: string;
  file: string;
  symbol: string;
  depth: number;
  repoHop: number;
  severity: Severity;
  confidence: number;
  reason: string;
  changeId: string;
  via: string[];
}

export interface RepoImpact {
  repoId: number;
  name: string;
  level: "origin" | "direct" | "indirect";
  hop: number;
  nodeCount: number;
  fileCount: number;
  files: string[];
  severity: Severity;
  confidence: number;
  confirmed: number;
  potential: number;
  reasons: string[];
}

export interface ImpactReport {
  changes: Change[];
  findings: Finding[];
  affected: AffectedNode[];
  repos: RepoImpact[];
}

export interface TestRec {
  repoId: number;
  repoName: string;
  file: string;
  priority: "must" | "should" | "nice";
  reason: string;
  covers: string[];
}

export interface MissingCoverage {
  repoId: number;
  repoName: string;
  file: string;
  symbol: string;
  why: string;
}

export interface RiskFactor {
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface Fix {
  id: string;
  changeId: string;
  role: "producer" | "consumer";
  repoId: number;
  repoName: string;
  file: string;
  line: number;
  title: string;
  description: string;
  patch: string;
}

export interface PRAnalysis {
  generatedAt: string;
  engine: "rule-engine" | "llm";
  summary: string;
  changes: Change[];
  explanations: Record<string, string>;
  findings: Finding[];
  affected: AffectedNode[];
  repos: RepoImpact[];
  risk: { score: number; level: "low" | "medium" | "high"; factors: RiskFactor[] };
  tests: { recommended: TestRec[]; missing: MissingCoverage[] };
  fixes: Fix[];
  verify: string[];
  stats: {
    changed: number;
    confirmed: number;
    potential: number;
    safe: number;
    affectedRepos: number;
    affectedNodes: number;
  };
}
