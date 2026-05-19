/**
 * ModelDispatcher: the boundary between the loop runtime and a
 * concrete agent platform. The loop hands a DispatchRequest to a
 * dispatcher; the dispatcher returns a DispatchResult. It is the
 * dispatcher's job to:
 *   - choose the actual model implementing `tier`,
 *   - execute the work,
 *   - return the resulting document body / file mutations / log.
 *
 * The loop does NOT inspect outputs semantically — eval is mechanical
 * via the gate engine (KAT-T-0110). The dispatcher is therefore allowed
 * to be deterministic in tests (FakeDispatcher below) without breaking
 * loop semantics.
 */
import type { DocumentType, ShortCode } from "../types/document.js";
import type { ModelTier } from "./types.js";

/** What the loop hands the dispatcher each iteration. */
export interface DispatchRequest {
  short_code: ShortCode;
  level: DocumentType;
  pass?: "high" | "low";
  tier: ModelTier;
  /** Iteration index (0-based). Useful for retry-aware adapters. */
  iteration: number;
  /** Full markdown body of the doc as it stands going into this work step. */
  body: string;
  /**
   * For task-low-pass only: the body of the corresponding completed
   * task-high-pass scaffold. Empty string for non-low-pass docs.
   */
  scaffoldBody: string;
  /** Optional structured feedback from the previous iteration's gates. */
  priorGateFailures: ReadonlyArray<{ gate: string; code: string; message: string; pointer?: string }>;
}

/** What the dispatcher returns. */
export interface DispatchResult {
  /** New body to write back to the doc before eval. The loop persists. */
  newBody: string;
  /** True iff the dispatcher believes its work succeeded mechanically.
   *  False does NOT immediately fail the loop — gates still run. */
  workOk: boolean;
  /** Free-form log line(s) the loop appends to LoopIteration. */
  log: string;
}

export interface ModelDispatcher {
  dispatch(req: DispatchRequest): Promise<DispatchResult>;
}

/* ─────────────── FakeDispatcher ─────────────── */

/**
 * Deterministic, scriptable dispatcher for tests. Each call pops the
 * next entry from `script`. When `script` is empty it throws — tests
 * should always script enough iterations.
 *
 * The fake produces `newBody` by concatenating the prior body with the
 * `appendOnDispatch` string, so the gate engine sees a real change.
 */
export interface FakeStep {
  /** Body suffix to append. May contain markdown the gate expects. */
  appendOnDispatch: string;
  workOk?: boolean;        // default true
  log?: string;            // default "fake step"
}

export class FakeDispatcher implements ModelDispatcher {
  private idx = 0;
  constructor(private readonly script: ReadonlyArray<FakeStep>) {}

  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    const step = this.script[this.idx++];
    if (!step) {
      throw new Error(
        `FakeDispatcher exhausted at iteration ${req.iteration} for ${req.short_code}`,
      );
    }
    return {
      newBody: req.body + step.appendOnDispatch,
      workOk: step.workOk ?? true,
      log: step.log ?? "fake step",
    };
  }

  /** Test helper: how many script entries have been consumed. */
  callsMade(): number {
    return this.idx;
  }
}
