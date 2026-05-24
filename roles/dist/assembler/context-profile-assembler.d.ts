import type { RoleInvocation } from "protocol";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import type { StructuredModelInput } from "../runner/structured-model.js";
export declare class ContextProfileAssembler {
    assemble(invocation: RoleInvocation, definition: RoleDefinition, roleContext: RoleContext): StructuredModelInput;
}
