/**
 * index.ts: package entry point.
 *
 * createEngine() returns the MorpheusASTEngine described in contracts.ts. The apps
 * receive the engine through their adapter and use only the types from contracts.ts.
 *
 * Parser selection: createEngine() parses with the TypeScript Compiler API, which runs in a
 * browser with no extra assets. The audited Tree-sitter WASM parser is a separate entry point,
 * "morpheus-ast-core/tree-sitter", so bundles that do not use it never load web-tree-sitter or
 * need to host a grammar .wasm file.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero `any` types, no domain vocabulary, no UI dependencies.
 */

import type {
  MorpheusASTEngine,
  ParsedFile,
  SecurityScanResult,
} from "./contracts.js";
import { SourceParser } from "./parser/index.js";
import { TopologyCompiler } from "./topology/index.js";
import { FaultInjector, computeBlastRadius } from "./blast-radius/fault-injector.js";
import { SurgicalMutator } from "./mutator/index.js";
import { BugfixSpecGenerator } from "./mutator/bugfix-generator.js";
import { computeMutationDiff } from "./mutator/diff.js";
import { fingerprintText } from "./mutator/fingerprint.js";
import { SecurityIngestionAdapter } from "./security/ingestion.js";
import { getSampleRepository } from "./sample-repo/index.js";
import { planRemediation } from "./remediation/index.js";
import { loadCode } from "./loader/index.js";
import { fetchGitHubRepository, parseRepositoryRef } from "./loader/github.js";

export type * from "./contracts.js";

export function createEngine(): MorpheusASTEngine {
  const parser = new SourceParser();
  const topology = new TopologyCompiler();
  const injector = new FaultInjector();
  const mutator = new SurgicalMutator();
  const bugfixes = new BugfixSpecGenerator();
  const security = new SecurityIngestionAdapter();

  return {
    getSampleRepository,

    generateBugfixMarkdown: (spec) => bugfixes.toMarkdown(spec),
    ingestExternalFindings: (report, graph) => [
      ...security.ingestSonarQube(report.sonarqube ?? [], graph),
      ...security.ingestSnyk(report.snyk ?? [], graph),
      ...security.ingestAwsSecurity(report.awsSecurity ?? [], graph),
      ...security.ingestAikido(report.aikido ?? [], graph),
    ],

    parseSourceFiles: (request) => parser.parse(request),
    buildTopologyGraph: (files) => topology.build(files),

    computeBlastRadius: async (functionId, graph) => computeBlastRadius(functionId, graph),
    injectFault: async (request, graph) => injector.inject(request, graph),

    applySurgicalMutation: (request) => mutator.apply(request),
    rollbackMutation: (record) => mutator.rollback(record),
    applyMutationToText: (source, splices) => {
      const { mutated, rollbackRecord } = mutator.applyToString(source, splices);
      return { mutatedSource: mutated, rollbackRecord };
    },
    rollbackMutationText: (mutatedSource, record) => mutator.rollbackString(mutatedSource, record),

    computeMutationDiff,
    fingerprintText,

    generateBedrockPatch: async (request) => {
      // Loaded on demand so bundles that never call Bedrock do not pull in the AWS SDK.
      const { BedrockAdvisor } = await import("./bedrock-advisor/index.js");
      return new BedrockAdvisor().generatePatch(request);
    },
    generateBugfixSpec: (fault, graph, patch) => bugfixes.generate(fault, graph, patch),

    runSecurityScan: async (files: readonly ParsedFile[]): Promise<readonly SecurityScanResult[]> => {
      const graph = await topology.build(files);
      return security.runInternalAnalysis(files, graph);
    },

    planRemediation: (finding, sourceText, options) =>
      planRemediation(finding, sourceText, options),
    loadCode,
    fetchGitHubRepository,
    parseRepositoryRef,
  };
}
