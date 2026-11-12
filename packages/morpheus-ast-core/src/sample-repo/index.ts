/**
 * sample-repo/index.ts
 *
 * Pre-loaded Serverless Sample Repository manifest.
 *
 * Both apps (infrashield-chaos and necro-compiler-game) load this manifest
 * via contracts.ts to populate their demo view without requiring the judge
 * to upload any code or log in.
 *
 * The sample contains intentional code quality issues that exercise every
 * feature of both applications:
 *
 *   - routeRequest (CC ≥ 18)         → Boss Room / Poltergeist Demon Boss
 *   - validateUserInput (CC ≥ 16)    → Boss Room / Poltergeist Demon
 *   - handleGetUsers (no try/catch)  → Cascading Failure / Poltergeist Demon
 *   - handleGetConfig (Object.assign)→ Prototype Pollution taint path
 *   - handleCreateUser (no size check)→ Extreme Payload fault vector
 *   - UserService → DatabaseClient   → Circular dependency detection
 *   - unusedTimeout                  → Zombie Variable entity
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute paths to all files in the pre-loaded sample repository. */
export const SAMPLE_REPO_FILES: readonly string[] = [
  resolve(__dirname, "api-gateway.ts"),
  resolve(__dirname, "user-service.ts"),
  resolve(__dirname, "database-client.ts"),
];

/** Human-readable label for the sample shown in the UI. */
export const SAMPLE_REPO_LABEL = "Serverless API (Pre-loaded Demo)";

/** Description shown in the app when the sample is active. */
export const SAMPLE_REPO_DESCRIPTION =
  "A three-file serverless TypeScript API with intentional " +
  "vulnerabilities, high-complexity functions, circular dependencies, " +
  "and uncaught exception paths — ready to audit or exorcise.";

/** Expected findings for smoke-testing both apps after load. */
export const SAMPLE_REPO_EXPECTED = {
  minFunctions: 12,
  minEdges: 8,
  minCircularDeps: 1,
  minSecurityFindings: 5,
  bossRoomFunctionNames: ["routeRequest", "validateUserInput"],
  taintSinkFunctionNames: ["handleGetConfig"],
  uncaughtExceptionFunctions: ["handleGetUsers", "processWebhook", "connect"],
  unusedVariables: ["unusedTimeout"],
} as const;
