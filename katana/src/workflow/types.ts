/**
 * Workflow-specific types for the work → eval → gate → loop → done runtime.
 * Imports document types from src/types/document.ts so the locked storage
 * surface is the single source of truth for level/phase/short-code shapes.
 */
import type { DocumentType, Phase, ShortCode } from "../types/document.js";

/** Model tier dispatcher targets. Vision: strong-for-design, cheap-for-fill, ui-for-ui. */
export type ModelTier = "strong" | "cheap" | "ui";

/** Reasons a phase transition (next phase) was rejected by the engine. */
export type TransitionRejection =
  | { kind: "no-such-phase"; phase: string }
  | { kind: "not-forward"; from: Phase; to: Phase }
  | { kind: "wrong-level"; level: DocumentType; phase: Phase }
  | { kind: "scaffold-incomplete"; lowPass: ShortCode; scaffold: ShortCode; scaffoldPhase: Phase | "missing" }
  | { kind: "exit-criteria-not-met"; short_code: ShortCode };

/** Loop terminal outcome. */
export type LoopOutcome =
  | { kind: "completed"; short_code: ShortCode; iterations: number }
  | { kind: "blocked"; short_code: ShortCode; iterations: number; reason: BlockReason };

/** Why the loop gave up. Structured so callers can act mechanically. */
export type BlockReason =
  | { kind: "max-iterations"; max: number; lastGateFailures: GateFailureSummary[] }
  | { kind: "scaffold-incomplete"; scaffold: ShortCode; scaffoldPhase: Phase | "missing" }
  | { kind: "dispatcher-error"; message: string }
  | { kind: "exit-criteria-not-met"; failures: GateFailureSummary[] };

/** Compact form of a gate failure for logs and BlockReason payloads. */
export interface GateFailureSummary {
  gate: string;
  code: string;
  message: string;
  pointer?: string;
}

/** A single iteration record. Useful for tests, debug output, and post-mortems. */
export interface LoopIteration {
  index: number;             // 0-based
  startedAt: string;         // ISO-8601
  endedAt: string;           // ISO-8601
  workOk: boolean;
  evalOk: boolean;
  gateFailures: GateFailureSummary[];
}

/** Trace returned by runLoop — used by integration tests + future reporters. */
export interface LoopTrace {
  short_code: ShortCode;
  iterations: LoopIteration[];
  outcome: LoopOutcome;
}
