# ADR: katana arch-pattern fit in dev-genie

## Status

Decided

## Context

Katana is a Claude Code plugin + MCP server + document workspace for agent-driven kanban workflows. It does not ship `eslint.config.mjs` or `tsconfig.json`. 

Existing patterns (`arch-next-vercel`, `arch-node-api`, `arch-supabase-api`, `arch-supabase-node-rag`) are application architectures—each ships lint rules and TypeScript configuration to enforce boundaries, naming conventions, and code quality within an application repository.

Katana's footprint is a plugin/server package + template set for workflow documents, not application code to be linted. It sits at a different level of abstraction: it is a coordination tool that orchestrates work decomposition and agent dispatch, not a scaffold for building domain logic.

## Options

1. **Reuse `arch-node-api`** — katana's runtime is a Node MCP server, so it could adopt the node-api layered architecture rules (routes → handlers → services → repos). Concern: this conflates the architecture of katana's server implementation with the architecture pattern that katana helps *enforce* in downstream projects. Users installing katana care about the workflow, not about whether katana's own server follows node-api boundaries.

2. **Add new pattern `agent-workflow-mcp-workspace`** — create a dedicated architecture pattern that documents katana's footprint: MCP server entry points, template directories, workspace metadata, and the guard rails specific to agent-workflow tools (e.g., phase-transition gates, exit-criteria validation, document lint rules). This pattern is independent of the application architecture chosen by the user's downstream project.

3. **Skip the pattern catalog entirely** — register katana only in the dev-genie orchestration registry (Sub-plugin registry) without adding an `arch-*` entry. Rationale: katana is not an application architecture; it is a sub-plugin that orchestrates work. The catalog is for scaffolding application code; katana orchestrates work *across* applications.

## Decision

**Option 2: Add a new pattern `agent-workflow-mcp-workspace`.**

Katana occupies a distinct niche in the development workflow that existing patterns do not cover. The patterns catalog is already heterogeneous (Next.js apps, Node servers, Supabase-specific stacks), and katana belongs in it because teams installing katana need a documented scaffold, linting rules specific to document workflows, and clear boundaries around the MCP server, templates, and workspace structure. Creating a dedicated pattern makes it discoverable via `/scaffold-architecture` and provides a place to document katana-specific guard rails (e.g., no manual document edits outside of gates, required fields in phase metadata, template extensibility rules).

## Consequences

- [ ] Create `/Users/danielcassil/Code/gaurd-rails-boilerplate/guardrails/skills/arch-agent-workflow-mcp-workspace/SKILL.md` documenting the agent-workflow-mcp pattern.
- [ ] Create `/Users/danielcassil/Code/gaurd-rails-boilerplate/architectures/agent-workflow-mcp-workspace/` directory with pattern scaffold (package.json, tsconfig.json, eslint.config.mjs for MCP server code, workspace layout guide, template structure).
- [ ] Update `/Users/danielcassil/Code/gaurd-rails-boilerplate/guardrails/skills/guard-rails-catalog/SKILL.md` to add `agent-workflow-mcp-workspace` to the catalog table and routing logic.
- [ ] Create katana sub-plugin registry entry in dev-genie orchestration (implementation task: reference KAT-T-0022).
- [ ] Document MCP server boundary rules, template validation rules, and phase-gate guard rails in the new skill.

## References

- Vision: KAT-V-0001 Katana Vision
- Initiative: KAT-I-0007 dev-genie Architecture Pattern and Integration
- Contract reference: KAT-T-0020 dev-genie Sub-plugin Contract Reference
- Existing pattern examples: `/Users/danielcassil/Code/gaurd-rails-boilerplate/guardrails/skills/arch-node-api/SKILL.md`, `/Users/danielcassil/Code/gaurd-rails-boilerplate/guardrails/skills/guard-rails-catalog/SKILL.md`
