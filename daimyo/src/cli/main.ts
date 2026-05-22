import { asTaskId } from "../core/domain.js";
import {
  createStandaloneDaimyo,
  defaultWorkspaceDirForPlan,
  type StandalonePlanType,
} from "../standalone/composition.js";

interface CliOptions {
  readonly plan: string;
  readonly type?: StandalonePlanType;
  readonly task?: string;
  readonly cwd?: string;
  readonly workspaceDir?: string;
  readonly maxEvents?: number;
  readonly model?: string;
  readonly apiKeyEnv?: string;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command !== "run") {
    throw new Error(`Unknown daimyo command "${command}".`);
  }

  const options = parseRunOptions(rest);
  const daimyo = createStandaloneDaimyo({
    workspaceDir: options.workspaceDir ?? defaultWorkspaceDirForPlan(options.plan),
    plan: {
      filePath: options.plan,
      ...(options.type === undefined ? {} : { type: options.type }),
    },
    model: {
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.apiKeyEnv === undefined ? {} : { apiKeyEnv: options.apiKeyEnv }),
    },
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  const taskId = options.task === undefined ? await firstRunnableTaskId(daimyo.workSource) : options.task;
  const result = await daimyo.supervisor.run(asTaskId(taskId), {
    ...(options.maxEvents === undefined ? {} : { maxEvents: options.maxEvents }),
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseRunOptions(args: readonly string[]): CliOptions {
  let plan: string | undefined;
  let type: StandalonePlanType | undefined;
  let task: string | undefined;
  let cwd: string | undefined;
  let workspaceDir: string | undefined;
  let maxEvents: number | undefined;
  let model: string | undefined;
  let apiKeyEnv: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--plan") {
      plan = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--type") {
      type = readPlanType(readOptionValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--task") {
      task = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--cwd") {
      cwd = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--workspace") {
      workspaceDir = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-events") {
      maxEvents = readPositiveInteger(readOptionValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--model") {
      model = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--api-key-env") {
      apiKeyEnv = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option "${arg}".`);
  }

  if (plan === undefined) {
    throw new Error("daimyo run requires --plan <file>.");
  }

  return {
    plan,
    ...(type === undefined ? {} : { type }),
    ...(task === undefined ? {} : { task }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(workspaceDir === undefined ? {} : { workspaceDir }),
    ...(maxEvents === undefined ? {} : { maxEvents }),
    ...(model === undefined ? {} : { model }),
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
  };
}

async function firstRunnableTaskId(workSource: {
  listTasks(): Promise<readonly { readonly id: string; readonly status: string }[]>;
}): Promise<string> {
  const tasks = await workSource.listTasks();
  const task = tasks.find((candidate) => candidate.status === "active" || candidate.status === "todo");
  if (task === undefined) {
    throw new Error("No todo or active task found in the WorkSource plan.");
  }
  return task.id;
}

function readOptionValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function readPlanType(value: string): StandalonePlanType {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`Unsupported --type "${value}". Expected markdown or json.`);
}

function readPositiveInteger(value: string, option: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer.`);
  }
  return parsed;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage:",
      "  daimyo run --plan <plan.md|plan.json> [--task <id>] [--type markdown|json]",
      "",
      "Options:",
      "  --workspace <dir>     Durable .supervisor state directory (defaults beside the plan)",
      "  --cwd <dir>           Worker cwd (defaults to current directory)",
      "  --max-events <n>      Stop after n transport events",
      "  --model <name>        Tier-1 model (default: DAIMYO_MODEL or claude-sonnet-4-5)",
      "  --api-key-env <name>  API key env var (default: ANTHROPIC_API_KEY)",
      "",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`daimyo: ${message}\n`);
  process.exit(1);
});
