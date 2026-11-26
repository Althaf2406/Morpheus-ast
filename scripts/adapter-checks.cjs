/**
 * scripts/adapter-checks.cjs: run by scripts/verify-adapters.mjs (pnpm run verify:adapters).
 * Drives the real adapters against the real engine; Bedrock is replaced by a recorder.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createEngine } = require("../packages/morpheus-ast-core/.tmp-build/src/index.js");
const { NecroCompilerAdapter } = require("../.tmp-build/apps/apps/necro-compiler-game/src/adapter.js");
const { InfraShieldAdapter } = require("../.tmp-build/apps/apps/infrashield-chaos/src/adapter.js");

const ok = (m) => console.log("PASS " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** An engine whose Bedrock call is replaced by a recorder; `delays` are consumed one per call. */
function engineWithStubbedBedrock(delays = []) {
  const real = createEngine();
  const calls = [];
  const engine = {
    ...real,
    generateBedrockPatch: async (req) => {
      calls.push(req);
      const delay = delays.shift() ?? 0;
      if (delay > 0) await sleep(delay);
      return {
        mutationId: "stub", targetFunctionId: req.faultResult.targetFunctionId,
        suggestedSplices: [{ filePath: "x.ts", startIndex: 0, endIndex: 0, replacement: "y", description: "stub splice" }],
        rationale: "stub", confidence: 0.5, modelId: "stub", durationMs: 1,
      };
    },
  };
  return { engine, calls };
}

(async () => {
  // =========================== InfraShield ===========================
  {
    const { engine, calls } = engineWithStubbedBedrock();
    const infra = new InfraShieldAdapter(engine);
    const city = await infra.loadSampleRepository();
    const target = city.nodes.find((n) => n.name === "handleGetUsers");
    assert.ok(target);

    // generateBugfixSpec before any fault must fail clearly.
    assert.throws(() => infra.generateBugfixSpec(), /no active fault/);
    ok("infra: no bugfix spec before a fault is injected");

    await infra.injectFault({ targetFunctionId: target.id, faultType: "UNCAUGHT_EXCEPTION" });
    await sleep(20);
    assert.equal(calls.length, 1);
    const sent = calls[0].targetFunctionSource;
    assert.ok(sent.startsWith("async function handleGetUsers"), "advisor must receive the real function source, got: " + sent.slice(0, 40));
    assert.ok(!sent.includes("Source unavailable"));
    ok("infra: Bedrock receives the real function source");

    assert.equal(infra.getSREDashboard().lastPatch.targetFunctionId, target.id);
    const md = infra.generateBugfixMarkdown();
    assert.ok(md.includes("## Current Behavior (Defect)"));
    assert.ok(md.includes("## Expected Behavior (Correct)"));
    assert.ok(md.includes("## Unchanged Behavior / Preservation Properties (Regression Prevention)"));
    assert.ok(md.includes("### Splice 1: stub splice"));
    const file = infra.generateBugfixFile();
    assert.equal(file.fileName, "bugfix.md");
    assert.equal(file.content.length > 200, true);
    ok("infra: 1-click bugfix.md export works end to end (with the patch's splice)");

    const before = infra.getSREDashboard().criticalFindings;
    const layout = infra.ingestExternalFindings({
      snyk: [{ id: "s", severity: "critical", title: "Prototype Pollution", description: "d", packageName: "lodash", cvssScore: 9.1 }],
      sonarqube: [{ key: "k", severity: "BLOCKER", type: "VULNERABILITY", message: "m", rule: "r", component: "proj:" + target.filePath }],
    });
    assert.equal(infra.getSREDashboard().criticalFindings, before + 2);
    assert.ok(layout.securityFindings.some((f) => f.sourceScanner === "SNYK"));
    ok("infra: external scanner findings reach the risk report");

    await infra.loadSampleRepository();
    assert.throws(() => infra.generateBugfixSpec(), /no active fault/);
    ok("infra: loading a repository clears the previous fault and patch");
  }

  // A slow Bedrock answer for an old fault must not overwrite the current fault's patch.
  {
    const { engine } = engineWithStubbedBedrock([80, 10]);
    const infra = new InfraShieldAdapter(engine);
    const city = await infra.loadSampleRepository();
    const a = city.nodes.find((n) => n.name === "handleGetUsers");
    const b = city.nodes.find((n) => n.name === "handleGetConfig");
    await infra.injectFault({ targetFunctionId: a.id, faultType: "UNCAUGHT_EXCEPTION" }); // patch arrives after 80 ms
    await infra.injectFault({ targetFunctionId: b.id, faultType: "UNCAUGHT_EXCEPTION" }); // patch arrives after 10 ms
    assert.equal(infra.getSREDashboard().lastPatch, null, "a patch from before this fault must not be shown");
    await sleep(160);
    assert.equal(infra.getSREDashboard().lastPatch.targetFunctionId, b.id, "the slow reply for the old fault overwrote the new one");
    ok("infra: stale Bedrock reply for an older fault is ignored");
  }

  // ========================== NECRO-COMPILER ==========================
  {
    const { engine, calls } = engineWithStubbedBedrock();
    const necro = new NecroCompilerAdapter(engine);
    const layout = await necro.loadSampleRepository();

    const room = layout.rooms.find((r) => r.entities.length > 0);
    assert.ok(room, "sample should have at least one room with entities");
    await necro.getSpellHint(room.entities[0].entityId, layout);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].faultResult.targetFunctionId, room.id, "hint must target the function of the entity's room");
    assert.ok(calls[0].targetFunctionSource.includes(room.functionName));
    assert.ok(!calls[0].targetFunctionSource.includes("Source available via"));
    ok(`necro: spell hint targets "${room.functionName}" and sends its real source`);

    await assert.rejects(necro.getSpellHint("entity-does-not-exist", layout), /not found/);
    ok("necro: unknown entity is rejected");

    const validate = layout.rooms.find((r) => r.functionName === "validateUserInput");
    const before = validate.entities.length;
    const withScan = necro.ingestExternalFindings({
      sonarqube: [{
        key: "k", severity: "CRITICAL", type: "VULNERABILITY", message: "weak validation", rule: "r",
        component: "demo:sample/user-service.ts",
        textRange: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 0 },
      }],
      snyk: [{ id: "s", severity: "high", title: "t", description: "d", packageName: "p" }],
    });
    assert.equal(withScan.rooms.find((r) => r.functionName === "validateUserInput").entities.length, before, "findings without a line must not attach to a room");
    ok("necro: findings without a line number do not spawn entities in a random room");

    const fn = (await (async () => {
      const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: engine.getSampleRepository().files, includeSourceText: true });
      return (await engine.buildTopologyGraph(parsed.files)).functions.find((f) => f.name === "validateUserInput");
    })());
    const line = fn.range.startLine + 2;
    const boss = necro.ingestExternalFindings({
      sonarqube: [{
        key: "k2", severity: "CRITICAL", type: "VULNERABILITY", message: "weak validation", rule: "r",
        component: "demo:sample/user-service.ts",
        textRange: { startLine: line, endLine: line, startOffset: 0, endOffset: 1 },
      }],
    });
    const after = boss.rooms.find((r) => r.functionName === "validateUserInput").entities;
    assert.equal(after.length, before + 1);
    assert.ok(after.some((e) => e.type === "POLTERGEIST_DEMON_BOSS"));
    ok("necro: a critical scanner finding on a line spawns a boss entity in that room");
  }

  // ---- regression: in-memory spells and the disk path ----
  {
    const adapter = new NecroCompilerAdapter(createEngine());
    const layout0 = await adapter.loadSampleRepository();
    const file = "sample/user-service.ts";
    const original = adapter.getSourceText(file);
    const cc = (layout, name) => layout.rooms.find((r) => r.functionName === name).cyclomaticComplexity;
    const before = cc(layout0, "validateUserInput");

    const start = original.indexOf('  if (data["age"] !== undefined) {');
    const endMarker = 'throw new Error("age too large");';
    const end = original.indexOf("}", original.indexOf(endMarker) + endMarker.length) + 1;
    await adapter.castSpell({ splices: [{ filePath: file, startIndex: start, endIndex: end, replacement: "", description: "remove age checks" }] });
    const after = cc(adapter.buildDungeonLayout(), "validateUserInput");
    assert.ok(after < before);
    await assert.rejects(adapter.castSpell({ splices: [
      { filePath: file, startIndex: 10, endIndex: 30, replacement: "x", description: "a" },
      { filePath: file, startIndex: 20, endIndex: 40, replacement: "y", description: "b" },
    ] }));
    await adapter.rollbackLastSpell();
    assert.equal(adapter.getSourceText(file), original);
    assert.equal(cc(adapter.buildDungeonLayout(), "validateUserInput"), before);
    ok(`regression: in-memory spell ${before} -> ${after}, conflict rejected, rollback exact`);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "necro-adapter-"));
    try {
      const diskFile = path.join(dir, "disk.ts");
      const diskSource = "export function pick(x: number): number {\n  if (x > 1) { return 1; }\n  return 2;\n}\n";
      fs.writeFileSync(diskFile, diskSource, "utf8");
      await adapter.loadRepository([diskFile]);
      const s = diskSource.indexOf("return 1;");
      await adapter.castSpell({ splices: [{ filePath: diskFile, startIndex: s, endIndex: s + 9, replacement: "return 99;", description: "disk edit" }] });
      assert.ok(fs.readFileSync(diskFile, "utf8").includes("return 99;"));
      await adapter.rollbackLastSpell();
      assert.equal(fs.readFileSync(diskFile, "utf8"), diskSource);
      ok("regression: disk path cast and rollback");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("ALL ADAPTER CHECKS PASSED");
})().catch((e) => {
  console.error("FAIL " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
