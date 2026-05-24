import type { RoleSkipReason } from "protocol";

import type { RoleDefinition } from "../runner/role-definition.js";

export type RoleRegistryResolveResult =
  | { readonly kind: "hit"; readonly definition: RoleDefinition }
  | { readonly kind: "miss"; readonly reason: RoleSkipReason };

export class RoleRegistry {
  private readonly definitionsByRoleId = new Map<string, Map<string, RoleDefinition>>();

  register(definition: RoleDefinition): this {
    const definitionsByVersion =
      this.definitionsByRoleId.get(definition.role_id) ?? new Map<string, RoleDefinition>();
    if (definitionsByVersion.has(definition.role_version)) {
      throw new Error(
        `Role ${definition.role_id}@${definition.role_version} is already registered`,
      );
    }

    definitionsByVersion.set(definition.role_version, definition);
    this.definitionsByRoleId.set(definition.role_id, definitionsByVersion);
    return this;
  }

  resolve(roleId: string, roleVersion?: string): RoleRegistryResolveResult {
    const definitionsByVersion = this.definitionsByRoleId.get(roleId);
    if (definitionsByVersion === undefined) {
      return {
        kind: "miss",
        reason: {
          code: "role:not_registered",
          category: "not_applicable",
          details: {
            requested_role_id: roleId,
          },
        },
      };
    }

    if (roleVersion === undefined) {
      const firstDefinition = firstRegisteredDefinition(definitionsByVersion);
      if (firstDefinition !== undefined) {
        return { kind: "hit", definition: firstDefinition };
      }
    }

    const definition =
      roleVersion === undefined ? undefined : definitionsByVersion.get(roleVersion);
    if (definition !== undefined) {
      return { kind: "hit", definition };
    }

    return {
      kind: "miss",
      reason: {
        code: "role:unsupported_version",
        category: "policy",
        details: {
          requested_role_id: roleId,
          requested_role_version: roleVersion ?? "",
          supported_role_versions: [...definitionsByVersion.keys()],
        },
      },
    };
  }

  list(): readonly RoleDefinition[] {
    const definitions: RoleDefinition[] = [];
    for (const definitionsByVersion of this.definitionsByRoleId.values()) {
      definitions.push(...definitionsByVersion.values());
    }
    return definitions;
  }
}

function firstRegisteredDefinition(
  definitionsByVersion: ReadonlyMap<string, RoleDefinition>,
): RoleDefinition | undefined {
  for (const definition of definitionsByVersion.values()) {
    return definition;
  }
  return undefined;
}
