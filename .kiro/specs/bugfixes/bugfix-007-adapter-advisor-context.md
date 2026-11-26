# Bugfix Spec 007: Adapters Gave the AI Advisor No Real Code and Mixed Up Faults

**Spec ID**: `bugfix-007`
**Files**: `apps/infrashield-chaos/src/adapter.ts`, `apps/necro-compiler-game/src/adapter.ts`
**Discovered by**: code review while wiring the bugfix export. Unlike `bugfix-002` to `bugfix-006`, these defects were
**not observed as failing tests first**; the placeholder text is visible in the old source. Verification is
`pnpm run verify:adapters`, which drives both adapters against the real engine.
**Methodology**: Property-Aware Code Evolution (C ⟹ P)

---

## Current Behavior (Defect)

1. **No real source sent to the advisor.** Both adapters passed placeholder text
   (`"// Source unavailable at adapter layer..."`, `"// Source available via Live Engine Inspector"`) as
   `targetFunctionSource`. With the strict validator from `bugfix-004` every suggestion would be rejected.
2. **Stale patch (InfraShield).** `lastPatch` was never cleared. A bugfix spec for a new fault could include
   the patch computed for an earlier fault, and a slow reply for fault A could overwrite the patch for fault B.
   A newly loaded repository also kept the previous fault and patch.
3. **Wrong target for a spell hint (NECRO).** `getSpellHint` compared an entity's *finding id* with a room's
   *function id*. The two never match, so it silently fell back to the first function in the graph.

---

## Expected Behavior (Correct)

- Each adapter keeps the text of the files it analysed and sends the function's own source
  (`file.slice(range.startIndex, range.endIndex)`) to the advisor. If the text is unavailable, InfraShield skips the
  Bedrock call and NECRO reports an error.
- InfraShield clears `lastPatch` whenever a new fault is injected or a repository is loaded, and ignores a reply
  that belongs to an earlier fault.
- NECRO finds the room that holds the entity and uses that room's function.

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

- Public adapter methods keep their names and return types; the new methods are
  `generateBugfixMarkdown`, `generateBugfixFile`, `ingestExternalFindings` (both apps), and `getSourceText` (NECRO).
- Bedrock stays best-effort in InfraShield: a failed or rejected suggestion never blocks the UI.
- In-memory spells, on-disk spells, rollback and conflict handling in NECRO behave as in `verify:adapters` before this change.

Checked by `scripts/adapter-checks.cjs` (12 checks), including: the advisor receives text starting with
`async function handleGetUsers`; a patch that resolves late for an older fault does not replace the current one;
a spell hint targets the function of the entity's room; and findings with no line number do not spawn entities.
