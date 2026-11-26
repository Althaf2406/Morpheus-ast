import type { CityNode, CyberCityLayout, SREDashboardData } from "../../../adapter.ts";
// --- Fixtures ---
type Fault = NonNullable<SREDashboardData["lastFault"]>;
type Finding = CyberCityLayout["securityFindings"][number];

export const FAULT: Fault = {
  targetFunctionId: "src/a.ts::alpha",
  faultType: "UNCAUGHT_EXCEPTION",
  affectedNodes: ["src/b.ts::beta", "src/c.ts::gamma"],
  cascadePath: [
    { functionId: "src/a.ts::alpha", reason: "NO_TRY_CATCH", depth: 0 },
    { functionId: "src/b.ts::beta", reason: "NO_FALLBACK", depth: 1 },
  ],
  taintPaths: [],
  centralityScore: 0.5,
  blastRadiusScore: 0.75,
  durationMs: 1,
};

export const FINDING: Finding = {
  findingId: "f-1",
  severity: "HIGH",
  category: "INJECTION",
  title: "Unsanitised query",
  description: "d",
  filePath: "src/db.ts",
  range: { filePath: "src/db.ts", startLine: 12, startColumn: 0, endLine: 12, endColumn: 4, startIndex: 0, endIndex: 4 },
  functionId: null,
  sourceScanner: "INTERNAL",
  cweId: null,
  cvssScore: null,
};


const node = (id: string, name: string, filePath: string): CityNode => ({
  id, name, filePath, complexity: 3, isFaulted: false, isAffected: false, centralityScore: 0,
});
export const NODES: readonly CityNode[] = [
  node("src/a.ts::alpha", "alpha", "src/a.ts"),
  node("src/b.ts::beta", "beta", "src/b.ts"),
];
