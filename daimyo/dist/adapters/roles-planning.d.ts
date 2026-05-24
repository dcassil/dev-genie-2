import { type StructuredModelCaller as RolesStructuredModelCaller } from "roles";
import type { PlanningRequest, PlanningResult, RolesPlanning } from "../core/ports/capabilities.js";
export interface RolesPlanningAdapterOptions {
    readonly modelClient: RolesStructuredModelCaller;
    readonly now?: () => Date;
}
export declare class RolesPlanningAdapter implements RolesPlanning {
    private readonly modelClient;
    private readonly now;
    constructor(options: RolesPlanningAdapterOptions);
    plan(request: PlanningRequest): Promise<PlanningResult>;
}
