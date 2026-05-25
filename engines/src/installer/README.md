# Installer Engine Consumer Pattern

Bootstrap invokes this Engine as a bounded deterministic primitive:

```ts
import {
  InstallerEngine,
  NodeFsReadPort,
  NodeManagedWriterAdapter,
  type DesiredState,
} from "engines";

const workspaceRoot = process.cwd();
const desired: DesiredState = {
  plugins: [],
  configs: [
    {
      target: "agent-config-guardrails",
      target_path: "CLAUDE.md",
      required: true,
    },
  ],
};

const engine = new InstallerEngine();
const repoState = await engine.detect(new NodeFsReadPort(), { workspaceRoot });
const installPlan = engine.plan(repoState, desired);

// Optional I-0012 autonomy gate reviews `installPlan` here.

const report = await engine.apply(installPlan, new NodeManagedWriterAdapter(), { workspaceRoot });

if (report.had_conflict) {
  // Bootstrap owns the follow-up sequencing.
} else if (report.counts.applied > 0) {
  // Bootstrap can continue after a typed install result.
}
```

Boundary: this Engine ships the typed detect -> plan -> apply -> report contract and the node filesystem/writer adapters. Bootstrap owns workflow sequencing, autonomy handshakes, phase transitions, and follow-up actions selected from the structured `ReconciliationReport`.
