import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AnthropicStructuredModelClient } from "daimyo";

import {
  createRegisteredV1RoleHarnessCases,
  runRoleHarnessCase,
} from "../harness/roles-harness.js";

const LIVE_FLAG = "ROLES_LIVE_SDK_TESTS";
const API_KEY_ENV = "ANTHROPIC_API_KEY";
const EVIDENCE_DIR = resolve(process.cwd(), "evidence/dogfood");

async function main(): Promise<void> {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const liveFlagEnabled = process.env[LIVE_FLAG] === "1";
  const apiKey = process.env[API_KEY_ENV];
  const credentialPresent = apiKey !== undefined && apiKey.length > 0;
  if (!liveFlagEnabled || !credentialPresent) {
    await writeJson("run-summary.json", {
      status: "skipped",
      live_flag: {
        name: LIVE_FLAG,
        enabled: liveFlagEnabled,
      },
      credential_preflight: {
        required_env: API_KEY_ENV,
        present: credentialPresent,
      },
      finding: liveFlagEnabled
        ? `Missing ${API_KEY_ENV}; live Roles dogfood call was not attempted.`
        : `${LIVE_FLAG}=1 was not set; live Roles dogfood call was not attempted.`,
    });
    return;
  }

  const architectCase = createRegisteredV1RoleHarnessCases()[0];
  if (architectCase === undefined) {
    throw new Error("Roles live dogfood could not find an Architect harness case");
  }

  try {
    const flow = await runRoleHarnessCase(architectCase, {
      modelClient: new AnthropicStructuredModelClient({
        apiKey,
        model: process.env.ROLES_LIVE_MODEL ?? process.env.DAIMYO_MODEL ?? "claude-sonnet-4-5",
        ...(process.env.DAIMYO_MODEL_ENDPOINT === undefined
          ? {}
          : { endpoint: process.env.DAIMYO_MODEL_ENDPOINT }),
        maxTokens: 4000,
      }),
    });
    await writeJson("role-invocation.json", flow.invocation);
    await writeJson("role-result.json", flow.roleResult);
    await writeJson("produced-artifact.json", flow.producedArtifact);
    await writeJson("run-summary.json", {
      status: "completed",
      live_flag: {
        name: LIVE_FLAG,
        enabled: true,
      },
      credential_preflight: {
        required_env: API_KEY_ENV,
        present: true,
      },
      case_name: flow.case_name,
      role_result_status: flow.roleResult.payload.status,
      produced_artifact_type: flow.producedArtifact.artifact_type,
      produced_artifact_ref: flow.producedArtifact.artifact_id,
    });
  } catch (error) {
    await writeJson("run-summary.json", {
      status: "failed",
      live_flag: {
        name: LIVE_FLAG,
        enabled: true,
      },
      credential_preflight: {
        required_env: API_KEY_ENV,
        present: true,
      },
      finding: errorMessage(error),
    });
    throw error;
  }
}

async function writeJson(fileName: string, value: object): Promise<void> {
  const target = resolve(EVIDENCE_DIR, fileName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown Roles live dogfood failure";
}

await main();
