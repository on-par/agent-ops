#!/bin/bash
# start-worker.sh - Start autonomous worker in tmux and tail logs
#
# Usage:
#   ./scripts/start-worker.sh              # Start worker, tail logs
#   ./scripts/start-worker.sh em3          # Pass pattern to worker
#   ./scripts/start-worker.sh --attach     # Attach to worker session instead of tailing
#   ./scripts/start-worker.sh --kill       # Kill existing worker session
#   CLAUDE_CMD=ccymcp ./scripts/start-worker.sh  # Use MCP-enabled claude
#
# The worker runs in tmux session "claude-worker"
# Logs are tailed from .claude-runs/main-*.log
#
# Environment:
#   CLAUDE_CMD    Claude command to use (passed to autonomous-worker.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$WORK_DIR/.claude-runs"
SESSION_NAME="claude-worker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse special flags
ATTACH_MODE=false
KILL_MODE=false
WORKER_ARGS=()

for arg in "$@"; do
    case $arg in
        --attach|-a)
            ATTACH_MODE=true
            ;;
        --kill|-k)
            KILL_MODE=true
            ;;
        *)
            WORKER_ARGS+=("$arg")
            ;;
    esac
done

# Kill mode - stop existing session
if [ "$KILL_MODE" = true ]; then
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${YELLOW}Killing session: $SESSION_NAME${NC}"
        tmux kill-session -t "$SESSION_NAME"
        echo -e "${GREEN}Session killed${NC}"
    else
        echo -e "${YELLOW}No active session found${NC}"
    fi
    exit 0
fi

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${YELLOW}Worker session already running!${NC}"
    echo ""
    echo "Options:"
    echo "  $0 --attach    # Attach to existing session"
    echo "  $0 --kill      # Kill existing session"
    echo ""

    if [ "$ATTACH_MODE" = true ]; then
        echo -e "${BLUE}Attaching to session...${NC}"
        tmux attach-session -t "$SESSION_NAME"
    else
        # Default: tail the latest log
        echo -e "${BLUE}Tailing latest log (Ctrl+C to stop)...${NC}"
        echo ""
        tail_log
    fi
    exit 0
fi

# Attach mode but no session
if [ "$ATTACH_MODE" = true ]; then
    echo -e "${RED}No worker session running. Start one first.${NC}"
    exit 1
fi

# Create log directory
mkdir -p "$LOG_DIR"

# Start tmux session with autonomous worker
echo -e "${GREEN}Starting autonomous worker in tmux session: $SESSION_NAME${NC}"

# Build the command (pass through CLAUDE_CMD if set)
WORKER_CMD=""
if [ -n "${CLAUDE_CMD:-}" ]; then
    WORKER_CMD="CLAUDE_CMD='$CLAUDE_CMD' "
fi
WORKER_CMD="$WORKER_CMD$SCRIPT_DIR/autonomous-worker.sh"
if [ ${#WORKER_ARGS[@]} -gt 0 ]; then
    WORKER_CMD="$WORKER_CMD ${WORKER_ARGS[*]}"
fi

# Create detached tmux session running the worker
tmux new-session -d -s "$SESSION_NAME" -c "$WORK_DIR" "$WORKER_CMD; echo ''; echo 'Worker finished. Press any key to close.'; read -n 1"

echo -e "${GREEN}Worker started!${NC}"
echo ""
echo -e "Session: ${BLUE}$SESSION_NAME${NC}"
echo -e "Logs:    ${BLUE}$LOG_DIR${NC}"
echo ""
echo "Commands:"
echo "  tmux attach -t $SESSION_NAME   # Attach to worker"
echo "  $0 --kill                      # Stop worker"
echo ""

# Wait a moment for log file to be created
sleep 2

# Function to find and tail the latest log
tail_log() {
    local latest_log
    latest_log=$(ls -t "$LOG_DIR"/main-*.log 2>/dev/null | head -1)

    if [ -n "$latest_log" ]; then
        echo -e "${BLUE}Tailing: $latest_log${NC}"
        echo -e "${YELLOW}(Ctrl+C to stop tailing - worker continues in background)${NC}"
        echo ""
        tail -f "$latest_log"
    else
        echo -e "${YELLOW}No log file found yet. Waiting...${NC}"
        # Wait for log to appear
        while [ ! -f "$LOG_DIR"/main-*.log ]; do
            sleep 1
        done
        latest_log=$(ls -t "$LOG_DIR"/main-*.log 2>/dev/null | head -1)
        echo -e "${BLUE}Tailing: $latest_log${NC}"
        tail -f "$latest_log"
    fi
}

# Tail the log
tail_log
