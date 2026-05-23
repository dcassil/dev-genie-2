import type { DecisionRecord } from "../core/domain.js";

export interface HumanDecisionNotifier {
  notify(record: DecisionRecord): Promise<void>;
}

export interface ConsoleHumanDecisionNotifierOptions {
  readonly write?: (message: string) => void;
}

export class ConsoleHumanDecisionNotifier implements HumanDecisionNotifier {
  private readonly write: (message: string) => void;

  constructor(options: ConsoleHumanDecisionNotifierOptions = {}) {
    this.write = options.write ?? ((message) => process.stderr.write(message));
  }

  async notify(record: DecisionRecord): Promise<void> {
    this.write(
      [
        `Daimyo awaiting human decision ${record.payload.decision_id}`,
        `node=${record.payload.request.node_id}`,
        `task=${record.payload.request.task_id}`,
        `tier=${record.payload.tier}`,
        `reason=${record.payload.rationale}`,
        "",
      ].join("\n"),
    );
  }
}
