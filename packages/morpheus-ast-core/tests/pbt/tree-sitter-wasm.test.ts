/**
 * tests/pbt/tree-sitter-wasm.test.ts
 *
 * Audits the real Tree-sitter WASM parser (not a simulation):
 *   W1  alloc/delete pairing over many generated parses
 *   W2  a throwing visitor still releases the tree
 *   W3  node offsets are UTF-16 indexes (slice(start,end) === node.text), with Unicode input
 *   W4  WASM heap growth: 2000 clean parses stay flat; a deliberate leak is detectable
 */

import * as fc from "fast-check";
import Parser from "web-tree-sitter";
import { TreeSitterParser } from "../../src/parser/tree-sitter.js";
import { TreeMemoryAuditor } from "../../src/parser/index.js";

const RUNS = Number(process.env["FC_RUNS"] ?? "300");
const GRAMMAR = require.resolve("tree-sitter-wasms/out/tree-sitter-typescript.wasm");

// Capture every WebAssembly.Memory the tree-sitter runtime creates so the WASM heap
// can be measured directly. Must be installed before the first Parser.init().
// (The core tsconfig deliberately has no DOM lib, so WebAssembly is typed locally.)
interface WasmMemoryLike {
  readonly buffer: ArrayBuffer;
}
type WasmMemoryCtor = new (descriptor: object) => WasmMemoryLike;
const wasmGlobal = (globalThis as unknown as { WebAssembly: { Memory: WasmMemoryCtor } }).WebAssembly;

const capturedMemories: WasmMemoryLike[] = [];
const OriginalMemory = wasmGlobal.Memory;
class SpyMemory extends OriginalMemory {
  constructor(descriptor: object) {
    super(descriptor);
    capturedMemories.push(this);
  }
}
wasmGlobal.Memory = SpyMemory;

const wasmHeapBytes = (): number => capturedMemories.reduce((sum, m) => sum + m.buffer.byteLength, 0);

const bigSource = (functions: number): string =>
  Array.from(
    { length: functions },
    (_, i) =>
      `export function f${i}(a: number, b: string): number {\n` +
      `  if (a > ${i}) { return a * ${i + 1}; }\n  for (let k = 0; k < a; k++) { b += String(k); }\n  return b.length;\n}\n`
  ).join("\n");

const mb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;

describe("tree-sitter WASM audit", () => {
  let auditor: TreeMemoryAuditor;
  let parser: TreeSitterParser;

  beforeAll(async () => {
    auditor = new TreeMemoryAuditor();
    parser = await TreeSitterParser.create(GRAMMAR, auditor);
  });

  afterAll(() => {
    parser.dispose();
  });

  beforeEach(() => {
    auditor.reset();
  });

  it("W1: every generated parse allocates and deletes exactly one tree", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), fc.fullUnicodeString({ maxLength: 20 }), (junk, text) => {
        const source = `const s = ${JSON.stringify(text)};\n// ${junk.replace(/[\r\n]/g, " ")}\nfunction g() { return s; }\n`;
        const before = auditor.report();
        parser.analyze(source);
        const after = auditor.report();
        expect(after.allocated - before.allocated).toBe(1);
        expect(after.deleted - before.deleted).toBe(1);
      }),
      { numRuns: RUNS }
    );
    expect(auditor.leakCount).toBe(0);
  });

  it("W2: a visitor that throws still releases the tree", () => {
    for (let i = 0; i < 100; i++) {
      expect(() =>
        parser.withTree("function h() {}", () => {
          throw new Error("visitor failed");
        })
      ).toThrow("visitor failed");
    }
    const report = auditor.report();
    expect(report.allocated).toBe(100);
    expect(report.leaked).toBe(0);
  });

  it("W3: node offsets are UTF-16 indexes into the parsed string (Unicode input)", () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 20 }), (text) => {
        const source = `const label = ${JSON.stringify(text)}; /* \u{1F600} */ let x = 1;\n`;
        const mismatches = parser.withTree(source, (root) => {
          const bad: string[] = [];
          const stack: Parser.SyntaxNode[] = [root];
          while (stack.length > 0) {
            const node = stack.pop()!;
            if (source.slice(node.startIndex, node.endIndex) !== node.text) bad.push(node.type);
            for (const child of node.children) stack.push(child);
          }
          return bad;
        });
        expect(mismatches).toEqual([]);
      }),
      { numRuns: Math.min(RUNS, 200) }
    );
  });

  it("W4: 1000 parses with delete() keep the WASM heap flat; skipping delete() grows it", async () => {
    expect(capturedMemories.length).toBeGreaterThan(0); // spy is wired to the real runtime
    const source = bigSource(40);

    // Warm up so one-time allocations are not counted.
    for (let i = 0; i < 100; i++) parser.analyze(source);
    const baseline = wasmHeapBytes();

    for (let i = 0; i < 1000; i++) parser.analyze(source);
    const cleanGrowth = wasmHeapBytes() - baseline;
    expect(auditor.leakCount).toBe(0);

    // Negative control: same work on a raw Parser WITHOUT tree.delete().
    // It leaks on purpose and runs last so it cannot affect the measurement above.
    const language = await Parser.Language.load(GRAMMAR);
    const leaky = new Parser();
    leaky.setLanguage(language);
    const leakBaseline = wasmHeapBytes();
    for (let i = 0; i < 300; i++) leaky.parse(source);
    const leakyGrowth = wasmHeapBytes() - leakBaseline;

    // eslint-disable-next-line no-console
    console.log(
      `WASM heap: baseline=${mb(baseline)} MB, growth with delete() over 1000 parses=${mb(cleanGrowth)} MB, ` +
        `growth WITHOUT delete() over 300 parses=${mb(leakyGrowth)} MB`
    );

    expect(cleanGrowth).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(leakyGrowth).toBeGreaterThan(Math.max(cleanGrowth * 4, 8 * 1024 * 1024));
  }, 120_000);
});
