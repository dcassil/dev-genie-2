import { type DocumentType, type Phase, PHASES_BY_LEVEL } from "../../types/document.js";

export function nextPhase(level: DocumentType, current: Phase): Phase | null {
  const seq = PHASES_BY_LEVEL[level];
  const i = seq.indexOf(current);
  if (i === -1) throw new Error(`Unknown phase '${current}' for level=${level}`);
  return i + 1 < seq.length ? seq[i + 1] : null;
}

export function isForwardTransition(level: DocumentType, from: Phase, to: Phase): boolean {
  const seq = PHASES_BY_LEVEL[level];
  const a = seq.indexOf(from), b = seq.indexOf(to);
  return a !== -1 && b !== -1 && b > a;
}

/** Replace any existing `#phase/...` tag with `#phase/<phase>`; preserve order otherwise. */
export function syncPhaseTag(tags: string[], phase: Phase): string[] {
  const idx = tags.findIndex((t) => t.startsWith("#phase/"));
  const next = `#phase/${phase}`;
  if (idx === -1) return [...tags, next];
  const out = tags.slice(); out[idx] = next; return out;
}
