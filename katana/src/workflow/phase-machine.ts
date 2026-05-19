/**
 * Phase machine. Pure functions over (DocumentType, Phase) — no I/O,
 * no document mutation. Callers (loop runtime, MCP transition_phase
 * tool) apply the transition; this module just answers "is it legal?".
 *
 * Tables are hardcoded per docs/schema/frontmatter.md. To add a doc
 * type, extend src/types/document.ts FIRST, then this table.
 */
import { PHASES_BY_LEVEL } from "../types/document.js";
import type { DocumentType, Phase } from "../types/document.js";
import type { TransitionRejection } from "./types.js";

/** Ordered phase list for a level. Throws if level is unknown. */
export function phasesFor(level: DocumentType): readonly Phase[] {
  const phases = PHASES_BY_LEVEL[level];
  if (!phases) throw new Error(`Unknown document level: ${level}`);
  return phases;
}

/** Index of `phase` within the level's ordering, or -1 if not a member. */
export function phaseIndex(level: DocumentType, phase: Phase): number {
  return phasesFor(level).indexOf(phase);
}

/** True iff `phase` is the terminal phase for `level`. */
export function isTerminal(level: DocumentType, phase: Phase): boolean {
  const phases = phasesFor(level);
  return phases.length > 0 && phases[phases.length - 1] === phase;
}

/** Next phase, or null if `phase` is terminal. Throws if phase is not in the table. */
export function nextPhase(level: DocumentType, phase: Phase): Phase | null {
  const i = phaseIndex(level, phase);
  if (i < 0) throw new Error(`Phase "${phase}" not valid for level "${level}"`);
  const phases = phasesFor(level);
  return i + 1 < phases.length ? phases[i + 1]! : null;
}

/**
 * Validate a proposed transition. Returns null if legal, otherwise a
 * structured rejection. Pure.
 *
 * Legal transitions are exactly: phaseIndex(level, to) === phaseIndex(level, from) + 1.
 *
 * Note: scaffold-incomplete and exit-criteria-not-met rejections are
 * NOT produced here — they require document context and are checked
 * by handoff.ts (KAT-T-0104) and the gate engine adapter (KAT-T-0110).
 */
export function validateTransition(
  level: DocumentType,
  from: Phase,
  to: Phase,
): TransitionRejection | null {
  const phases = phasesFor(level);
  if (!phases.includes(to)) return { kind: "no-such-phase", phase: to };
  if (!phases.includes(from)) return { kind: "wrong-level", level, phase: from };
  const fi = phases.indexOf(from);
  const ti = phases.indexOf(to);
  if (ti !== fi + 1) return { kind: "not-forward", from, to };
  return null;
}

/** Convenience: every legal (from,to) pair for a level. Useful for tests/UI. */
export function allTransitions(level: DocumentType): ReadonlyArray<{ from: Phase; to: Phase }> {
  const phases = phasesFor(level);
  const out: { from: Phase; to: Phase }[] = [];
  for (let i = 0; i + 1 < phases.length; i++) out.push({ from: phases[i]!, to: phases[i + 1]! });
  return out;
}
