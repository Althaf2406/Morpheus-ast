# Bugfix Spec 006: Model Text Could Break Out of the Generated bugfix.md

**Spec ID**: `bugfix-006`
**File**: `packages/morpheus-ast-core/src/mutator/bugfix-generator.ts`
**Function**: `BugfixSpecGenerator.toMarkdown()`
**Discovered by**: `tests/pbt/engine-facade.test.ts`, test F3, run against the unchanged generator
**Methodology**: Property-Aware Code Evolution (C ⟹ P)

---

## Current Behavior (Defect)

`toMarkdown` is now reachable from both apps (`engine.generateBugfixMarkdown`), and the splices it prints can
come from a language model. Each replacement was embedded in a fixed three-backtick block:

```
"- **Replacement**:\n```typescript\n" + s.replacement + "\n```"
```

**Observed failure** (F3): for a replacement containing a run of four backticks, the generated block used a
fence of length **3** (the test expected more than 4). Replacement text containing a fence could therefore close
the code block early and add its own headings or text to a `bugfix.md` that is shown to the user.

The splice `description` was also inserted on a heading line without removing newlines, so a description with
embedded newlines could start new markdown lines. This second case is covered by F3b, which was written together
with the fix and was **not observed failing before it**.

Violated property: **the replacement text appears in the output exactly once, inside one code block, and
nothing in it can alter the surrounding document**.

---

## Expected Behavior (Correct)

- `fenced(code)` chooses a fence longer than the longest run of backticks in `code`, with a minimum of 3.
- `oneLine(text)` collapses all whitespace, including newlines, to single spaces for the splice heading.
- `generateBugfixMarkdown(spec)` is exposed through `contracts.ts` and `createEngine()`, and both adapters
  offer it (`InfraShieldAdapter.generateBugfixMarkdown()` and `generateBugfixFile()`, which returns
  `{ fileName: "bugfix.md", content }`).

After the fix, F3, F3b and F4 pass; F4 is a property over strings made mostly of backticks, newlines and `#`.

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

- For ordinary replacements (no backticks) the output is identical to before: a three-backtick `typescript` block.
- The three Kiro sections (Current Behavior, Expected Behavior, Unchanged Behavior) and both property
  statements are still rendered (F1).
- A spec with no splices still says "No automated patch available" (F2).
- `BugfixSpec` and `generateBugfixSpec` are unchanged.

| Property | Invariant |
|---|---|
| F1 | the three Kiro sections, spec id and text are present, no `undefined` or `NaN` |
| F3, F4 | a replacement is reproduced exactly inside a fence longer than any backtick run in it |
| F3b | a description stays on one line |
