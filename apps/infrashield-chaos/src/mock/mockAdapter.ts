/**
 * src/mock/mockAdapter.ts
 *
 * Minimal mock satisfying BugfixSpecProvider for the UI dev/demo path.
 * Person A's adapter.ts is never modified.
 */

import { AdapterError } from "../adapter.ts";
import type { BugfixSpecProvider } from "../components/panels/BugfixSpecButton.tsx";
import { mockFaultedSREDashboard } from "./sreDashboard.ts";

// --- Mock implementation ---

export const mockAdapter: BugfixSpecProvider = {
  generateBugfixSpec() {
    const fault = mockFaultedSREDashboard.lastFault;
    const patch = mockFaultedSREDashboard.lastPatch;

    if (fault === null) {
      throw new AdapterError(
        "generateBugfixSpec: no active fault injection result. Run injectFault() first.",
      );
    }

    return {
      specId:              "bugfix-mock-001",
      title:               `Fix ${fault.faultType} in ${fault.targetFunctionId}`,
      targetFunctionId:    fault.targetFunctionId,
      filePath:            "src/api-gateway.ts",
      currentBehavior:
        `${fault.targetFunctionId} throws an uncaught exception under UNCAUGHT_EXCEPTION fault, ` +
        `cascading to ${fault.affectedNodes.length} downstream nodes.`,
      expectedBehavior:
        "routeRequest wraps its handler call in try/catch and returns a structured error " +
        "response, isolating the failure at the boundary.",
      unchangedBehavior:
        "Happy-path routing is unaffected. All other functions in the topology graph " +
        "continue to execute with identical behaviour.",
      fixProperty:
        "parse(print(mutate(tree))) is syntactically valid — no syntax errors after splice.",
      preservationProperty:
        "rollback(mutate(tree)) === original — byte-for-byte identical to pre-mutation source.",
      suggestedMutation: patch !== null
        ? { splices: [...patch.suggestedSplices] }
        : { splices: [] },
      faultType:        fault.faultType,
      blastRadiusScore: fault.blastRadiusScore,
      createdAt:        Date.now(),
    };
  },
};
