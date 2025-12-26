#!/bin/bash
set -e

# Agent container entrypoint script
# Validates environment variables and executes agent task

echo "Starting agent container"

# Validate required environment variables
if [ -z "$TASK_ID" ]; then
  echo "ERROR: TASK_ID environment variable is required" >&2
  exit 2
fi

if [ -z "$LLM_PROVIDER" ]; then
  echo "ERROR: LLM_PROVIDER environment variable is required" >&2
  exit 2
fi

if [ -z "$LLM_MODEL" ]; then
  echo "ERROR: LLM_MODEL environment variable is required" >&2
  exit 2
fi

echo "Task ID: $TASK_ID"
echo "LLM Provider: $LLM_PROVIDER"
echo "LLM Model: $LLM_MODEL"

# Configure git user for commits inside container
git config --global user.name "${GIT_AUTHOR_NAME:-Agent}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-agent@agent-ops.local}"

# Ensure workspace is current directory
cd /workspace

# Configure Ollama base URL if OLLAMA_HOST is provided
if [ -n "$OLLAMA_HOST" ]; then
  export LLM_BASE_URL="http://${OLLAMA_HOST}/v1"
  echo "Configured Ollama host: $LLM_BASE_URL"
fi

# Execute agent entrypoint
echo "Executing agent task..."
exec node /app/dist/agent-entrypoint.js
