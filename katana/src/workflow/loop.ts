/**
 * Work → eval → gate → loop → done runtime. One task document at a time.
 *
 * The runtime owns:
 *   - handoff guard (delegates to handoff.ts),
 *   - dispatch (delegates to ModelDispatcher),
 *   - persist (delegates to DocStore.write),
 *   - gate eval (delegates to GateAdapter.evaluate from KAT-T-0110),
 *   - phase advancement on success (uses phase-machine.nextPhase).
 *
 * The runtime does NOT mutate any state outside the doc it was handed,
 * and never advances a doc by more than one phase per loop call.
 */
import type { Document, ShortCode } from "../types/document.js";
import type { LoopOutcome, LoopTrace, LoopIteration, GateFailureSummary, BlockReason } from "./types.js";
import { nextPhase } from "./phase-machine.js";
import { assertCanStart, type DocLookup, type HandoffDocView } from "./handoff.js";
import type { ModelDispatcher, DispatchRequest } from "./dispatcher.js";
import type { GateAdapter, GateAdapterReport } from "./gate-adapter.js"; // KAT-T-0110
import { resolveTier, type WorkflowConfig } from "./model-config.js";

export const DEFAULT_MAX_ITERATIONS = 3;

export interface DocStore {
  /** Read latest version of this doc by short_code. */
  read(short_code: ShortCode): Document;
  /** Persist a new body and updated phase. Updates updated_at + file_hash. */
  write(doc: Document, patch: { body?: string; phase?: string }): Document;
}

export interface RunLoopOptions {
  doc: Document;
  store: DocStore;
  lookup: DocLookup;
  dispatcher: ModelDispatcher;
  gates: GateAdapter;
  config: WorkflowConfig;
  maxIterations?: number;
  /** Deterministic clock for tests. Defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

/** Top-level entry: execute the loop on `doc`, return a trace. */
export async function runLoop(opts: RunLoopOptions): Promise<LoopTrace> {
  const max = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const now = opts.now ?? (() => new Date().toISOString());
  const sc = opts.doc.frontmatter.short_code;
  const iterations: LoopIteration[] = [];

  // 1. Handoff guard (low-pass only).
  const view: HandoffDocView = {
    short_code: opts.doc.frontmatter.short_code,
    level: opts.doc.frontmatter.level,
    phase: opts.doc.frontmatter.phase,
    scaffold_task: opts.doc.frontmatter.scaffold_task,
  };
  const rejection = assertCanStart(view, opts.lookup);
  if (rejection && rejection.kind === "scaffold-incomplete") {
    return blockedTrace(sc, iterations, {
      kind: "scaffold-incomplete",
      scaffold: rejection.scaffold,
      scaffoldPhase: rejection.scaffoldPhase,
    });
  }

  // 2. Promote to "active" (todo→active) if currently todo.
  let doc = opts.doc;
  if (doc.frontmatter.phase === "todo") {
    doc = opts.store.write(doc, { phase: "active" });
  }

  // 3. Resolve scaffold body (low-pass only) once.
  const scaffoldBody = resolveScaffoldBody(doc, opts.store, opts.lookup);

  // 4. Iterate.
  let lastFailures: GateFailureSummary[] = [];
  for (let i = 0; i < max; i++) {
    const startedAt = now();
    const tier = resolveTier(opts.config, doc.frontmatter.level, doc.frontmatter.pass);
    const req: DispatchRequest = {
      short_code: doc.frontmatter.short_code,
      level: doc.frontmatter.level,
      pass: doc.frontmatter.pass,
      tier,
      iteration: i,
      body: doc.body,
      scaffoldBody,
      priorGateFailures: lastFailures,
    };

    let dispatchResult;
    try {
      dispatchResult = await opts.dispatcher.dispatch(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      iterations.push({ index: i, startedAt, endedAt: now(), workOk: false, evalOk: false, gateFailures: [] });
      return blockedTrace(sc, iterations, { kind: "dispatcher-error", message });
    }

    doc = opts.store.write(doc, { body: dispatchResult.newBody });

    const report: GateAdapterReport = await opts.gates.evaluate(doc);
    const failures = report.failures;
    lastFailures = failures;

    iterations.push({
      index: i,
      startedAt,
      endedAt: now(),
      workOk: dispatchResult.workOk,
      evalOk: report.ok,
      gateFailures: failures,
    });

    if (report.ok) {
      // Success — advance one phase. Tasks: active → completed.
      const next = nextPhase(doc.frontmatter.level, doc.frontmatter.phase);
      if (next) doc = opts.store.write(doc, { phase: next });
      return {
        short_code: sc,
        iterations,
        outcome: { kind: "completed", short_code: sc, iterations: iterations.length },
      };
    }
    // else: continue to next iteration with priorGateFailures.
  }

  return blockedTrace(sc, iterations, { kind: "max-iterations", max, lastGateFailures: lastFailures });
}

function blockedTrace(sc: ShortCode, iterations: LoopIteration[], reason: BlockReason): LoopTrace {
  return {
    short_code: sc,
    iterations,
    outcome: { kind: "blocked", short_code: sc, iterations: iterations.length, reason },
  };
}

function resolveScaffoldBody(doc: Document, store: DocStore, lookup: DocLookup): string {
  if (doc.frontmatter.level !== "task-low-pass") return "";
  const code = doc.frontmatter.scaffold_task;
  if (!code) return "";
  const view = lookup.get(code);
  if (!view) return "";
  // Re-read via store to get the latest body (lookup may be a metadata-only projection).
  try {
    return store.read(code).body;
  } catch {
    return "";
  }
}
