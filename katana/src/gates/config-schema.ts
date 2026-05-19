import type { DocumentLevel, Phase } from "./types.js";

/**
 * Subset of gates to apply for a given trigger. A trigger is a workflow
 * checkpoint such as "before transitioning a doc into phase X" or
 * "before decomposing a story into tasks".
 */
export interface GateTriggerRule {
  /**
   * Trigger discriminator. The workflow engine selects rules whose
   * trigger matches the current operation.
   */
  trigger:
    | { kind: "phase-transition"; level: DocumentLevel; to: Phase }
    | { kind: "decomposition"; level: DocumentLevel }
    | { kind: "create"; level: DocumentLevel }
    | { kind: "edit"; level: DocumentLevel };
  /** Ordered gate names to evaluate when the trigger matches. */
  gates: string[];
}

/**
 * Top-level config. `disabled` lets a project turn off built-in gates
 * without removing them from the rules list.
 */
export interface GateConfig {
  /** Schema version. Current value: 1. */
  version: 1;
  /** Gate names to never run, even if they appear in a rule. */
  disabled: string[];
  /** Ordered rules. The first matching rule wins. */
  rules: GateTriggerRule[];
}
