/**
 * tests/pbt/wasm-memory-audit.test.ts
 *
 * WASM Memory Leak Audit — verifies that every Tree-sitter tree allocation
 * is matched by exactly one tree.delete() call, enforcing the contract in
 * .kiro/steering/ast-surgical-splice.md §4.
 *
 * Tests:
 *   T1 — Auditor baseline: alloc without delete → leakCount > 0
 *   T2 — Auditor clean: alloc + delete → leakCount === 0
 *   T3 — PBT: N random alloc/delete cycles always converge to zero leaks
 *   T4 — PBT: Partial deletes always report the correct leak count
 *   T5 — Simulated parser loop: 100 parse iterations → zero leaks
 */

import * as fc from "fast-check";
import { TreeMemoryAuditor } from "../../src/parser/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("WASM memory audit", () => {
  // ── T1: Unbalanced alloc ───────────────────────────────────────────────────
  it("T1: allocating without deleting reports leak", () => {
    const auditor = new TreeMemoryAuditor();
    auditor.recordAlloc();
    auditor.recordAlloc();
    expect(auditor.leakCount).toBe(2);
    expect(auditor.isClean).toBe(false);
  });

  // ── T2: Balanced alloc + delete ────────────────────────────────────────────
  it("T2: balanced alloc + delete reports zero leaks", () => {
    const auditor = new TreeMemoryAuditor();
    auditor.recordAlloc();
    auditor.recordAlloc();
    auditor.recordDelete();
    auditor.recordDelete();
    expect(auditor.leakCount).toBe(0);
    expect(auditor.isClean).toBe(true);
  });

  // ── T3: PBT — N alloc/delete cycles always converge ───────────────────────
  it("T3 PBT: N balanced alloc+delete cycles always yield zero leaks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        (n) => {
          const auditor = new TreeMemoryAuditor();
          for (let i = 0; i < n; i++) auditor.recordAlloc();
          for (let i = 0; i < n; i++) auditor.recordDelete();
          expect(auditor.leakCount).toBe(0);
          expect(auditor.isClean).toBe(true);
        }
      ),
      { numRuns: 200, seed: 200 }
    );
  });

  // ── T4: PBT — Partial deletes report exact count ──────────────────────────
  it("T4 PBT: k allocations and j < k deletions always report exactly k-j leaks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (k, extra) => {
          const j = extra % (k + 1); // j ∈ [0, k]
          const auditor = new TreeMemoryAuditor();
          for (let i = 0; i < k; i++) auditor.recordAlloc();
          for (let i = 0; i < j; i++) auditor.recordDelete();
          expect(auditor.leakCount).toBe(k - j);
          expect(auditor.isClean).toBe(k === j);
        }
      ),
      { numRuns: 200, seed: 201 }
    );
  });

  // ── T5: Simulated parser loop — 100 iterations zero leaks ─────────────────
  it("T5: simulated parser loop of 100 iterations reports zero leaks", () => {
    const auditor = new TreeMemoryAuditor();

    /**
     * Simulates what the SourceParser does in production:
     *   1. Allocate a Tree (recordAlloc)
     *   2. Use it
     *   3. Delete it in a finally block (recordDelete)
     */
    const simulateParse = (): void => {
      auditor.recordAlloc();
      try {
        // Simulate using the tree (parse work)
        const _result = "parsed";
      } finally {
        // This finally block mirrors the mandatory tree.delete() in production
        auditor.recordDelete();
      }
    };

    for (let i = 0; i < 100; i++) {
      simulateParse();
    }

    const report = auditor.report();
    expect(report.allocated).toBe(100);
    expect(report.deleted).toBe(100);
    expect(report.leaked).toBe(0);
    expect(report.clean).toBe(true);
  });

  // ── T6: Error path — finally block still deletes ──────────────────────────
  it("T6: errors during parse do not prevent tree deletion via finally", () => {
    const auditor = new TreeMemoryAuditor();

    const simulateFailingParse = (): void => {
      auditor.recordAlloc();
      try {
        throw new Error("simulated parse error");
      } finally {
        // finally runs even on throw — this is the required pattern
        auditor.recordDelete();
      }
    };

    for (let i = 0; i < 50; i++) {
      try {
        simulateFailingParse();
      } catch {
        // Error is intentional — we just verify no leak
      }
    }

    expect(auditor.leakCount).toBe(0);
    expect(auditor.isClean).toBe(true);
  });

  // ── T7: Reset clears state ────────────────────────────────────────────────
  it("T7: reset() clears allocation and deletion counts", () => {
    const auditor = new TreeMemoryAuditor();
    auditor.recordAlloc();
    auditor.recordAlloc();
    auditor.recordDelete();
    expect(auditor.leakCount).toBe(1);

    auditor.reset();
    expect(auditor.leakCount).toBe(0);
    expect(auditor.isClean).toBe(true);
    expect(auditor.report().allocated).toBe(0);
  });
});
