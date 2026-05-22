# Daimyo

Daimyo is the out-of-process Supervisor for recursive govern-verify Loop execution. The same npm package runs standalone and serves as the dev-genie Loop substrate through port injection.

## Standalone Mode

Standalone mode wires the default adapter set in one composition root:

- `ClaudeSdkAgentTransport` for worker sessions
- markdown checklist and JSON `WorkSource` adapters
- `TieredDecisionProvider` with Tier 0 policy, the bundled versioned Tier-1 prompt (`daimyo.tier1-decision-role@1.0.0`), optional Tier 2 investigation, and Tier 3 human escalation
- command-runner `BuiltInValidation`
- console Tier-3 notifier
- JSONL execution state under `.supervisor/execution`

Use a markdown checklist as the zero-dependency plan floor:

```md
- [ ] Implement the small change
```

Then run:

```sh
export ANTHROPIC_API_KEY=...
daimyo run --plan plan.md
```

The API key is enough for the default Tier-1 decision call. If no model client or bundled prompt is available, routing decisions that Tier 0 cannot settle degrade to Tier 3 human notification instead of crossing the port boundary.

JSON plans are also supported:

```sh
daimyo run --plan plan.json --type json --task json-abc123
```

## Dev-Genie Mode

dev-genie depends on `daimyo` and constructs it through the same composition root:

```js
import { createStandaloneDaimyo } from "daimyo";

const daimyo = createStandaloneDaimyo({
  workSource: devGenieKatanaWorkSource,
  decisionProvider: devGenieDecisionProvider,
  validation: devGenieValidation,
  notifier: devGenieNotifier,
});
```

Injected adapters must satisfy Daimyo ports. Daimyo core does not import katana, guardrails, audit, or dev-genie internals; richer integrations enter only at the composition root. See `dev-genie/examples/daimyo-injected-adapter-demo.mjs` for a minimal injected WorkSource and DecisionProvider demo.
