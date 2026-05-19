import type { Gate, GateContext, GateResult, KatanaDocument } from "./types.js";

/**
 * Aggregate result from running multiple gates against one document.
 */
export interface GateRunReport {
  /** Document the gates were run against. */
  document: { path: string; short_code: string | undefined };
  /** Per-gate results in the order gates were supplied. */
  results: GateResult[];
  /** True iff every result has ok === true. */
  ok: boolean;
}

/**
 * Run every gate against doc with ctx and aggregate results.
 * Gates are invoked in supplied order. A throwing gate is caught and
 * converted into a single error-severity GateReason so one bad gate
 * cannot break the run.
 */
export function runGates(
  gates: ReadonlyArray<Gate>,
  doc: KatanaDocument,
  ctx: GateContext,
): GateRunReport {
  const results: GateResult[] = [];
  for (const gate of gates) {
    try {
      results.push(gate.evaluate(doc, ctx));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        gate: gate.name,
        ok: false,
        reasons: [
          {
            code: "gate.threw",
            message: `Gate "${gate.name}" threw: ${message}`,
            severity: "error",
          },
        ],
      });
    }
  }
  return {
    document: { path: doc.path, short_code: doc.frontmatter.short_code },
    results,
    ok: results.every((r) => r.ok),
  };
}
