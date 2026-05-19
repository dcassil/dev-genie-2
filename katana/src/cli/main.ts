import { runInstall } from "./install.js";

async function main(): Promise<number> {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    process.stderr.write(
      "Usage: katana <command> [options]\n\n" +
        "Commands:\n" +
        "  install <platform>   Install katana into a workspace (claude-code|cursor|openai-codex)\n",
    );
    return subcommand ? 0 : 2;
  }

  if (subcommand === "install") {
    return runInstall(rest, {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    });
  }

  process.stderr.write(`Unknown command: ${subcommand}\n`);
  return 2;
}

main().then((code) => process.exit(code));
