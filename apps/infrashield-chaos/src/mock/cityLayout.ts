import type { CyberCityLayout, CityNode, CityEdge } from "../adapter.ts";

// --- Mock nodes: 12 buildings in a 4×3 grid with varying complexity ---

const nodes: readonly CityNode[] = [
  { id: "fn-001", name: "handleRequest",    filePath: "src/api-gateway.ts",    complexity: 5, isFaulted: false, isAffected: false, centralityScore: 0.72 },
  { id: "fn-002", name: "authenticate",     filePath: "src/api-gateway.ts",    complexity: 3, isFaulted: false, isAffected: false, centralityScore: 0.55 },
  { id: "fn-003", name: "routeRequest",     filePath: "src/api-gateway.ts",    complexity: 7, isFaulted: true,  isAffected: false, centralityScore: 0.88 },
  { id: "fn-004", name: "validatePayload",  filePath: "src/api-gateway.ts",    complexity: 4, isFaulted: false, isAffected: true,  centralityScore: 0.40 },
  { id: "fn-005", name: "fetchUser",        filePath: "src/user-service.ts",   complexity: 2, isFaulted: false, isAffected: true,  centralityScore: 0.30 },
  { id: "fn-006", name: "updateUser",       filePath: "src/user-service.ts",   complexity: 6, isFaulted: false, isAffected: true,  centralityScore: 0.60 },
  { id: "fn-007", name: "deleteUser",       filePath: "src/user-service.ts",   complexity: 4, isFaulted: false, isAffected: false, centralityScore: 0.35 },
  { id: "fn-008", name: "queryDatabase",    filePath: "src/database-client.ts",complexity: 8, isFaulted: false, isAffected: true,  centralityScore: 0.95 },
  { id: "fn-009", name: "beginTransaction", filePath: "src/database-client.ts",complexity: 3, isFaulted: false, isAffected: false, centralityScore: 0.42 },
  { id: "fn-010", name: "commitTransaction",filePath: "src/database-client.ts",complexity: 5, isFaulted: false, isAffected: false, centralityScore: 0.38 },
  { id: "fn-011", name: "rollbackTransaction",filePath:"src/database-client.ts",complexity:2, isFaulted: false, isAffected: false, centralityScore: 0.25 },
  { id: "fn-012", name: "emitAuditEvent",   filePath: "src/event-bus.ts",      complexity: 1, isFaulted: false, isAffected: false, centralityScore: 0.18 },
];

// --- Mock edges: 15 directed call relationships ---

const edges: readonly CityEdge[] = [
  { id: "e-001", sourceId: "fn-001", targetId: "fn-002", isCyclic: false, isCascading: false },
  { id: "e-002", sourceId: "fn-001", targetId: "fn-003", isCyclic: false, isCascading: true  },
  { id: "e-003", sourceId: "fn-002", targetId: "fn-005", isCyclic: false, isCascading: false },
  { id: "e-004", sourceId: "fn-003", targetId: "fn-004", isCyclic: false, isCascading: true  },
  { id: "e-005", sourceId: "fn-003", targetId: "fn-006", isCyclic: false, isCascading: true  },
  { id: "e-006", sourceId: "fn-004", targetId: "fn-008", isCyclic: false, isCascading: true  },
  { id: "e-007", sourceId: "fn-005", targetId: "fn-008", isCyclic: false, isCascading: true  },
  { id: "e-008", sourceId: "fn-006", targetId: "fn-007", isCyclic: false, isCascading: false },
  { id: "e-009", sourceId: "fn-006", targetId: "fn-008", isCyclic: false, isCascading: true  },
  { id: "e-010", sourceId: "fn-008", targetId: "fn-009", isCyclic: false, isCascading: false },
  { id: "e-011", sourceId: "fn-009", targetId: "fn-010", isCyclic: false, isCascading: false },
  { id: "e-012", sourceId: "fn-010", targetId: "fn-011", isCyclic: false, isCascading: false },
  // Cyclic: fn-003 ↔ fn-006 represents a circular dependency
  { id: "e-013", sourceId: "fn-006", targetId: "fn-003", isCyclic: true,  isCascading: false },
  { id: "e-014", sourceId: "fn-007", targetId: "fn-012", isCyclic: false, isCascading: false },
  { id: "e-015", sourceId: "fn-001", targetId: "fn-012", isCyclic: false, isCascading: false },
];

export const mockCyberCityLayout: CyberCityLayout = {
  nodes,
  edges,
  activeBlastRadius: null,
  activeFault: null,
  securityFindings: [],
};
