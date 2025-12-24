# Agent Ops CLI

Simple CLI for running agent tasks without the dashboard. Perfect for fast iteration and testing.

## Usage

```bash
npm run cli -- run <task-id> --provider <provider> --model <model> [options]
```

## Examples

### Run with local Ollama

```bash
npm run cli -- run agent-ops-4ka.13 \
  --provider ollama \
  --model qwen2.5-coder:7b
```

### Run with OpenAI on a repo

```bash
npm run cli -- run ISSUE-123 \
  --provider openai \
  --model gpt-4 \
  --repo https://github.com/org/repo
```

### Run in existing workspace

```bash
npm run cli -- run TASK-456 \
  --provider anthropic \
  --model claude-3-5-sonnet-20241022 \
  --workspace /path/to/workspace
```

## Required Arguments

- `<task-id>` - Task ID to execute (e.g., agent-ops-4ka.13)
- `--provider <name>` - LLM provider (ollama, openai, anthropic, openrouter)
- `--model <name>` - Model name (e.g., qwen2.5-coder:7b, gpt-4, claude-3-5-sonnet-20241022)

## Optional Arguments

- `--repo <url>` - Git repository URL to clone (default: use --workspace)
- `--workspace <path>` - Existing workspace path (default: current directory)
- `--base-url <url>` - Override provider base URL
- `--api-key <key>` - API key for provider (can also use env vars)
- `--max-iterations <n>` - Maximum agent iterations (default: 20)
- `--help` - Show help message

## Environment Variables

You can set API keys via environment variables instead of passing them via `--api-key`:

- `OPENAI_API_KEY` - API key for OpenAI
- `ANTHROPIC_API_KEY` - API key for Anthropic
- `OPENROUTER_API_KEY` - API key for OpenRouter

## How It Works

The CLI:

1. Parses command-line arguments
2. Sets up the workspace (clone repo or use existing path)
3. Creates an LLM provider instance
4. Loads the task from `bd show <task-id>`
5. Executes the agent with the task
6. Outputs agent actions to stdout

## Architecture

The CLI uses the same `AgentEngineService` that powers the dashboard, ensuring consistent behavior. It bypasses the need for database setup and the web dashboard, making it perfect for:

- Quick testing during development
- CI/CD pipeline integration
- Scripting and automation
- Debugging agent behavior

## Output

The CLI streams agent output to stdout in real-time, showing:

- Task loading status
- Agent execution progress
- Final execution summary with metrics
- Any errors encountered

Exit code is 0 for success, 1 for failure.
