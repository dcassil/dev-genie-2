import type { DecisionRecord } from "../core/domain.js";
export interface HumanDecisionNotifier {
    notify(record: DecisionRecord): Promise<void>;
}
export interface ConsoleHumanDecisionNotifierOptions {
    readonly write?: (message: string) => void;
}
export declare class ConsoleHumanDecisionNotifier implements HumanDecisionNotifier {
    private readonly write;
    constructor(options?: ConsoleHumanDecisionNotifierOptions);
    notify(record: DecisionRecord): Promise<void>;
}
