import type { OwnershipSurface } from "protocol";
import type { PolicyDecisionInput } from "./engine.js";
export type ConflictClass = "no_conflict" | "soft_conflict" | "hard_conflict";
export interface ConflictAssessment {
    readonly conflict_class: ConflictClass;
    readonly affected_siblings: readonly string[];
    readonly rationale: string;
}
export type SiblingOwnership = Readonly<Partial<OwnershipSurface>> & {
    readonly sibling_id: string;
};
export declare function assessConflict(input: PolicyDecisionInput, siblings?: readonly SiblingOwnership[]): ConflictAssessment;
