import type {
  ExecutionEvidence,
  ExecutionNodeInput,
  ExecutionNodeState,
  ExecutionSnapshot,
  ExecutionStore,
  NodeId,
  TaskId,
} from "daimyo";
import type { ValidationReport } from "protocol";

export class InMemoryValidationStore implements ExecutionStore {
  private readonly nodes = new Map<string, ExecutionNodeState>();
  private readonly reports = new Map<string, ValidationReport>();
  private readonly evidenceByNode = new Map<string, readonly ExecutionEvidence[]>();

  async upsertNode(_taskId: TaskId, node: ExecutionNodeInput): Promise<void> {
    const key = nodeKey(node.id);
    const existing = this.nodes.get(key);
    this.nodes.set(key, {
      ...node,
      decisionRecordIds: existing?.decisionRecordIds ?? [],
      validationReportRefs: existing?.validationReportRefs ?? [],
      evidence: existing?.evidence ?? [],
    });
  }

  async recordDecision(): Promise<void> {
    return Promise.resolve();
  }

  async recordValidationReport(_taskId: TaskId, nodeId: NodeId, report: ValidationReport): Promise<void> {
    this.reports.set(report.payload.report_ref, report);
    const key = nodeKey(nodeId);
    const existing = this.nodes.get(key);
    if (existing !== undefined) {
      this.nodes.set(key, {
        ...existing,
        validationReportRefs: [...existing.validationReportRefs, report.payload.report_ref],
      });
    }
  }

  async appendEvidence(_taskId: TaskId, nodeId: NodeId, evidence: ExecutionEvidence): Promise<void> {
    const key = nodeKey(nodeId);
    const existingEvidence = this.evidenceByNode.get(key) ?? [];
    const nextEvidence = [...existingEvidence, evidence];
    this.evidenceByNode.set(key, nextEvidence);
    const existingNode = this.nodes.get(key);
    if (existingNode !== undefined) {
      this.nodes.set(key, { ...existingNode, evidence: nextEvidence });
    }
  }

  async setCursor(): Promise<void> {
    return Promise.resolve();
  }

  async invalidateResumeToken(): Promise<void> {
    return Promise.resolve();
  }

  async listTaskIds(): Promise<readonly TaskId[]> {
    return [...new Set([...this.nodes.values()].map((node) => node.taskId))];
  }

  async load(taskId: TaskId): Promise<ExecutionSnapshot> {
    return {
      taskId,
      nodes: [...this.nodes.values()].filter((node) => node.taskId === taskId),
      decisions: [],
      validationReports: [...this.reports.values()],
    };
  }

  getValidationReport(reportRef: string): ValidationReport | undefined {
    return this.reports.get(reportRef);
  }
}

function nodeKey(nodeId: NodeId): string {
  return nodeId;
}
