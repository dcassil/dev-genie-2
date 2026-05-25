import {
  asTaskId,
  createStandaloneDaimyo,
} from "../../daimyo/dist/index.mjs";

const injectedDecisionProvider = {
  async decidePermission(request) {
    return record(request, {
      type: "access",
      suggested_choice: "allow",
      suggested_response: "Allowed by dev-genie injected DecisionProvider.",
      confidence: 9,
      risk: 1,
      block_trigger: false,
    });
  },
  async decideRouting(request) {
    return record(request, {
      type: "decision",
      suggested_choice: "dev-genie-choice",
      suggested_response: "Resolved by dev-genie injected DecisionProvider.",
      confidence: 9,
      risk: 2,
      block_trigger: false,
    });
  },
};

const injectedWorkSource = {
  async listTasks() {
    return [{
      id: asTaskId("demo-task"),
      title: "Injected dev-genie WorkSource task",
      status: "todo",
      revision: "1",
    }];
  },
  async getTask() {
    return {
      id: asTaskId("demo-task"),
      title: "Injected dev-genie WorkSource task",
      status: "todo",
      revision: "1",
      body: "This task came from dev-genie, not Daimyo core.",
      acceptanceCriteria: ["Daimyo Supervisor is constructed through ports."],
    };
  },
  async markStatus(_id, _status, _evidence) {
    return this.getTask();
  },
  async patchTask(_id, _patch, _evidence) {
    return this.getTask();
  },
  async createTask() {
    return asTaskId("demo-follow-up");
  },
};

const daimyo = createStandaloneDaimyo({
  cwd: process.cwd(),
  workSource: injectedWorkSource,
  decisionProvider: injectedDecisionProvider,
});

console.log(Boolean(daimyo.supervisor));

function record(request, verdict) {
  return {
    id: request.id,
    request,
    verdict,
    tier: 0,
    rationale: "dev-genie injected adapter demo",
    createdAt: "2026-05-22T00:00:00.000Z",
  };
}
