#!/bin/bash
# start-rpi-worker.sh - Start RPI worker in tmux and tail logs
#
# Usage:
#   ./scripts/start-rpi-worker.sh              # Start worker, tail logs
#   ./scripts/start-rpi-worker.sh em3          # Pass pattern to worker
#   ./scripts/start-rpi-worker.sh --attach     # Attach to worker session
#   ./scripts/start-rpi-worker.sh --kill       # Kill existing worker session
#   ./scripts/start-rpi-worker.sh --mcp-config ~/.claude/mcp.json  # Use MCP config
#   ./scripts/start-rpi-worker.sh --dangerously-skip-permissions   # Skip permissions
#
# Options:
#   --attach, -a                    Attach to existing session instead of tailing
#   --kill, -k                      Kill existing worker session
#   --mcp-config <path>             Pass --mcp-config to claude
#   --dangerously-skip-permissions  Pass --dangerously-skip-permissions to claude
#
# The worker runs in tmux session "rpi-worker"
# Logs are tailed from .claude-runs/rpi-*.log
#
# Environment:
#   CLAUDE_CMD    Base claude command (default: claude)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${WORKER_DIR:-$(pwd)}"
LOG_DIR="$WORK_DIR/.claude-runs"
SESSION_NAME="rpi-worker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to find and tail the latest log
tail_log() {
    local latest_log
    latest_log=$(ls -t "$LOG_DIR"/rpi-*.log 2>/dev/null | head -1)

    if [ -n "$latest_log" ]; then
        echo -e "${BLUE}Tailing: $latest_log${NC}"
        echo -e "${YELLOW}(Ctrl+C to stop tailing - worker continues in background)${NC}"
        echo ""
        tail -f "$latest_log"
    else
        echo -e "${YELLOW}No log file found yet. Waiting...${NC}"
        while [ ! -f "$LOG_DIR"/rpi-*.log ]; do
            sleep 1
        done
        latest_log=$(ls -t "$LOG_DIR"/rpi-*.log 2>/dev/null | head -1)
        echo -e "${BLUE}Tailing: $latest_log${NC}"
        tail -f "$latest_log"
    fi
}

# Parse special flags
ATTACH_MODE=false
KILL_MODE=false
MCP_CONFIG=""
SKIP_PERMISSIONS=false
WORKER_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --attach|-a)
            ATTACH_MODE=true
            shift
            ;;
        --kill|-k)
            KILL_MODE=true
            shift
            ;;
        --mcp-config)
            MCP_CONFIG="$2"
            shift 2
            ;;
        --dangerously-skip-permissions)
            SKIP_PERMISSIONS=true
            shift
            ;;
        *)
            WORKER_ARGS+=("$1")
            shift
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
    echo -e "${YELLOW}RPI Worker session already running!${NC}"
    echo ""
    echo "Options:"
    echo "  $0 --attach    # Attach to existing session"
    echo "  $0 --kill      # Kill existing session"
    echo ""

    if [ "$ATTACH_MODE" = true ]; then
        echo -e "${BLUE}Attaching to session...${NC}"
        tmux attach-session -t "$SESSION_NAME"
    else
        echo -e "${BLUE}Tailing latest log (Ctrl+C to stop)...${NC}"
        echo ""
        tail_log
    fi
    exit 0
fi

# Attach mode but no session
if [ "$ATTACH_MODE" = true ]; then
    echo -e "${RED}No RPI worker session running. Start one first.${NC}"
    exit 1
fi

# Create log directory
mkdir -p "$LOG_DIR"

echo -e "${GREEN}Starting RPI worker in tmux session: $SESSION_NAME${NC}"

# Find rpi-worker.sh
if [ -x "$SCRIPT_DIR/rpi-worker.sh" ]; then
    WORKER_SCRIPT="$SCRIPT_DIR/rpi-worker.sh"
elif command -v rpi-worker.sh &>/dev/null; then
    WORKER_SCRIPT="rpi-worker.sh"
else
    echo -e "${RED}Cannot find rpi-worker.sh${NC}"
    exit 1
fi

# Build CLAUDE_CMD with any extra flags
FINAL_CLAUDE_CMD="${CLAUDE_CMD:-claude}"
if [ -n "$MCP_CONFIG" ]; then
    FINAL_CLAUDE_CMD="$FINAL_CLAUDE_CMD --mcp-config $MCP_CONFIG"
fi
if [ "$SKIP_PERMISSIONS" = true ]; then
    FINAL_CLAUDE_CMD="$FINAL_CLAUDE_CMD --dangerously-skip-permissions"
fi

# Build the command
WORKER_CMD="WORKER_DIR=\"$WORK_DIR\""
ESCAPED_CLAUDE_CMD="${FINAL_CLAUDE_CMD//\"/\\\"}"
WORKER_CMD="$WORKER_CMD CLAUDE_CMD=\"$ESCAPED_CLAUDE_CMD\""
WORKER_CMD="$WORKER_CMD \"$WORKER_SCRIPT\""
if [ ${#WORKER_ARGS[@]} -gt 0 ]; then
    for arg in "${WORKER_ARGS[@]}"; do
        ESCAPED_ARG="${arg//\"/\\\"}"
        WORKER_CMD="$WORKER_CMD \"$ESCAPED_ARG\""
    done
fi

# Create detached tmux session
ESCAPED_WORKER_CMD="${WORKER_CMD//\"/\\\"}"
tmux new-session -d -s "$SESSION_NAME" -c "$WORK_DIR" "bash -c \"$ESCAPED_WORKER_CMD\""

echo -e "${GREEN}RPI Worker started!${NC}"
echo ""
echo -e "Session: ${BLUE}$SESSION_NAME${NC}"
echo -e "Logs:    ${BLUE}$LOG_DIR${NC}"
echo ""
echo "Commands:"
echo "  tmux attach -t $SESSION_NAME   # Attach to worker"
echo "  $0 --kill                      # Stop worker"
echo ""

# Wait for log file
sleep 2

# Tail the log
tail_log
