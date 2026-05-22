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
        `Daimyo awaiting human decision ${record.id}`,
        `node=${record.request.nodeId}`,
        `task=${record.request.taskId}`,
        `tier=${record.tier}`,
        `reason=${record.rationale}`,
        "",
      ].join("\n"),
    );
  }
}
