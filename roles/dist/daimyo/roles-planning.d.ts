import type { StructuredModelCaller as RolesStructuredModelCaller } from "../runner/structured-model.js";
import type { PlanningRequest, PlanningResult, RolesPlanning } from "daimyo";
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
export declare function createRolesPlanning(options: RolesPlanningAdapterOptions): RolesPlanning;
