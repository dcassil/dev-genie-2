/**
 * GateAdapter: the only surface the loop runtime uses to call gates.
 * Translates a katana Document (storage shape) to a KatanaDocument
 * (gate shape), picks the gate set from GateConfig keyed on the
 * "phase-transition: <level> → <next-phase>" trigger, and runs them.
 *
 * Returns a flat failure list for LoopIteration.gateFailures.
 */
import type { Document } from "../types/document.js";
import type { Gate, KatanaDocument, GateContext } from "../gates/types.js";
import { runGates, type GateRunReport } from "../gates/runner.js";
import { createContext } from "../gates/context.js";
import type { GateConfig } from "../gates/config-schema.js";
import { nextPhase } from "./phase-machine.js";
import type { GateFailureSummary } from "./types.js";

export interface GateAdapterReport {
  ok: boolean;
  failures: GateFailureSummary[];
  /** Full underlying report, for diagnostic logging. */
  raw: GateRunReport;
}

export interface GateAdapter {
  evaluate(doc: Document): Promise<GateAdapterReport>;
}

/** Dependencies the adapter needs from the host: gate registry + workspace docs. */
export interface GateAdapterDeps {
  /** Map of gate-name → Gate impl (built-ins from src/gates/builtin/* + project gates). */
  registry: ReadonlyMap<string, Gate>;
  /** Effective gate config (already merged with defaults). */
  config: GateConfig;
  /** Snapshot of all non-archived docs for ctx.lookup / ctx.all. */
  workspace: () => ReadonlyArray<Document>;
}

export function createGateAdapter(deps: GateAdapterDeps): GateAdapter {
  return {
    async evaluate(doc: Document): Promise<GateAdapterReport> {
      const gates = selectGates(doc, deps.config, deps.registry);
      const all = deps.workspace().map(toGateDoc);
      const ctx: GateContext = createContext(all);
      const report = runGates(gates, toGateDoc(doc), ctx);
      const failures: GateFailureSummary[] = report.results.flatMap((r) =>
        r.reasons
          .filter((reason) => reason.severity === "error")
          .map((reason) => ({
            gate: r.gate,
            code: reason.code,
            message: reason.message,
            pointer: reason.pointer,
          })),
      );
      return { ok: report.ok, failures, raw: report };
    },
  };
}

/** Choose gates by the "phase-transition" trigger keyed on (level, next phase). */
function selectGates(
  doc: Document,
  config: GateConfig,
  registry: ReadonlyMap<string, Gate>,
): ReadonlyArray<Gate> {
  const level = doc.frontmatter.level;
  const to = nextPhase(level, doc.frontmatter.phase);
  if (!to) return []; // already terminal — no transition gate to run.
  const rule = config.rules.find(
    (r) => r.trigger.kind === "phase-transition" && r.trigger.level === level && r.trigger.to === to,
  );
  if (!rule) return [];
  const disabled = new Set(config.disabled);
  return rule.gates
    .filter((name) => !disabled.has(name))
    .map((name) => registry.get(name))
    .filter((g): g is Gate => g !== undefined);
}

/** Storage Document → gate KatanaDocument. */
function toGateDoc(doc: Document): KatanaDocument {
  return {
    path: doc.filepath,
    raw: "",                 // not used by current built-in gates
    frontmatter: doc.frontmatter as unknown as KatanaDocument["frontmatter"],
    body: doc.body,
    sections: parseSectionsLite(doc.body),
  };
}

/** Local copy of src/gates/loader.ts#parseSections to avoid pulling fs. */
function parseSectionsLite(body: string): KatanaDocument["sections"] {
  const HEADING = /^(#{2,6})\s+(.+?)\s*$/;
  const out: KatanaDocument["sections"] = [];
  let cur: { heading: string; depth: number; lines: string[] } | null = null;
  for (const line of body.split(/\r?\n/)) {
    const m = HEADING.exec(line);
    if (m) {
      if (cur) out.push({ heading: cur.heading, depth: cur.depth, body: cur.lines.join("\n").trim() });
      cur = { heading: m[2]!, depth: m[1]!.length, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) out.push({ heading: cur.heading, depth: cur.depth, body: cur.lines.join("\n").trim() });
  return out;
}
