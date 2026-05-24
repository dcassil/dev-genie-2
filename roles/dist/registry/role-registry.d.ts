import type { RoleSkipReason } from "protocol";
import type { RoleDefinition } from "../runner/role-definition.js";
export type RoleRegistryResolveResult = {
    readonly kind: "hit";
    readonly definition: RoleDefinition;
} | {
    readonly kind: "miss";
    readonly reason: RoleSkipReason;
};
export declare class RoleRegistry {
    private readonly definitionsByRoleId;
    register(definition: RoleDefinition): this;
    resolve(roleId: string, roleVersion?: string): RoleRegistryResolveResult;
    list(): readonly RoleDefinition[];
}
