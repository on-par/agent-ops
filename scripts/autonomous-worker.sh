#!/bin/bash
# autonomous-worker.sh - Memory-safe autonomous Claude worker
#
# Usage:
#   ./scripts/autonomous-worker.sh              # Work all ready beads
#   ./scripts/autonomous-worker.sh em3          # Only beads matching "em3"
#   ./scripts/autonomous-worker.sh "em3|kpr"    # Multiple patterns (regex)
#   ./scripts/autonomous-worker.sh --dry-run    # Show what would run
#   ./scripts/autonomous-worker.sh em3 --max 3  # Limit to 3 tasks
#   CLAUDE_CMD=ccymcp ./scripts/autonomous-worker.sh  # Use MCP-enabled claude
#
# Options:
#   --dry-run     Show tasks without executing
#   --max N       Maximum number of tasks to run
#   --timeout M   Timeout per task in minutes (default: 60)
#   --model M     Model to use: auto, sonnet, haiku (default: auto)
#   --help        Show this help
#
# Environment:
#   CLAUDE_CMD    Claude command to use (default: claude)
#                 Set to your MCP-enabled alias for extra capabilities

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Use current directory as work dir (allows global install)
WORK_DIR="${WORKER_DIR:-$(pwd)}"
LOG_DIR="$WORK_DIR/.claude-runs"
DEFAULT_TIMEOUT=60
MAX_TASKS=0  # 0 = unlimited
CLAUDE_CMD="${CLAUDE_CMD:-claude}"  # Use env var or default to 'claude'

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
PATTERN=""
DRY_RUN=false
TIMEOUT_MINS=$DEFAULT_TIMEOUT
MODEL_CHOICE="auto"  # auto, sonnet, or haiku

show_help() {
    head -20 "$0" | tail -18 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --max)
            MAX_TASKS="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT_MINS="$2"
            shift 2
            ;;
        --model)
            MODEL_CHOICE="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            ;;
        *)
            PATTERN="$1"
            shift
            ;;
    esac
done

mkdir -p "$LOG_DIR"

# Create timestamped main log file for this run
MAIN_LOG="$LOG_DIR/main-$(date '+%Y-%m-%d-%H-%M-%S').log"

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$MAIN_LOG"
}

# Get list of ready tasks, optionally filtered by pattern
get_ready_tasks() {
    local tasks
    # Parse: "1. [P1] agent-ops-em3.1: Title" -> "agent-ops-em3.1"
    tasks=$(bd ready --limit 100 2>/dev/null | grep -E '^\s*[0-9]+\.' | sed 's/.*] //' | cut -d: -f1)

    if [ -n "$PATTERN" ]; then
        echo "$tasks" | grep -E "$PATTERN" || true
    else
        echo "$tasks"
    fi
}

# Get task details for display
get_task_title() {
    local task_id="$1"
    bd show "$task_id" --json 2>/dev/null | grep '"title"' | head -1 | sed 's/.*"title": "//; s/",$//'
}

# Assess task complexity and return appropriate model
assess_model_for_task() {
    local task_id="$1"

    # If user specified a model, use it
    if [ "$MODEL_CHOICE" != "auto" ]; then
        echo "$MODEL_CHOICE"
        return
    fi

    # Get task details for assessment
    local task_info
    task_info=$(bd show "$task_id" 2>/dev/null | head -20)

    # Quick assessment prompt
    local assess_prompt="Assess this task's complexity. Reply with ONLY 'sonnet' or 'haiku'.

Use 'sonnet' for:
- New feature implementation
- Complex refactoring
- Architecture changes
- Multi-file changes
- Anything requiring deep reasoning

Use 'haiku' for:
- Bug fixes
- Simple updates
- Documentation
- Config changes
- Single-file changes

Task:
$task_info

Reply with ONLY the model name (sonnet or haiku):"

    # Run quick assessment with haiku (fast and cheap)
    local model_choice
    model_choice=$(claude -p "$assess_prompt" --model haiku --max-turns 1 2>/dev/null | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')

    # Validate response, default to sonnet if unclear
    if [[ "$model_choice" == "haiku" ]]; then
        echo "haiku"
    else
        echo "sonnet"  # Default to sonnet for complex/unclear tasks
    fi
}

# Run a single task in isolated process
run_task() {
    local task_id="$1"
    local task_num="$2"
    local total="$3"
    local log_file="$LOG_DIR/${task_id}-$(date +%Y%m%d-%H%M%S).log"

    # Determine which model to use
    local model
    model=$(assess_model_for_task "$task_id")

    log "${BLUE}[$task_num/$total]${NC} Starting ${YELLOW}$task_id${NC} (model: $model)"

    # The prompt - focused and specific
    local prompt="You are autonomously implementing issue $task_id.

STEPS:
1. First run: bd show $task_id
2. Read and understand the requirements
3. Explore the codebase to understand existing patterns
4. Implement the feature following existing conventions
5. Run relevant tests (npm test or similar)
6. If tests pass, commit your changes with a descriptive message
7. Run: bd close $task_id
8. Run: git push (IMPORTANT - always push your work)
9. CLEANUP: Kill any processes you started (dev servers, watchers, etc.)

GUIDELINES:
- Follow existing code patterns in the codebase
- Don't over-engineer - implement what's specified
- If blocked or uncertain, document why and move on
- Keep commits focused and atomic
- ALWAYS clean up after yourself:
  - Kill any background processes (npm run dev, watchers, servers)
  - Use 'pkill -f' or 'kill' to terminate processes you started
  - Check with 'ps aux | grep node' or similar before finishing
  - Do NOT leave orphaned processes running

Begin now."

    # Run claude in fresh process with timeout
    local start_time=$(date +%s)

    if timeout "${TIMEOUT_MINS}m" $CLAUDE_CMD -p "$prompt" \
        --model "$model" \
        --allowedTools "Read,Write,Edit,Bash,Glob,Grep,Task,TodoWrite" \
        --dangerously-skip-permissions \
        2>&1 | tee "$log_file"; then
        local exit_code=0
    else
        local exit_code=$?
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local duration_min=$((duration / 60))
    local duration_sec=$((duration % 60))

    if [ $exit_code -eq 0 ]; then
        log "${GREEN}[$task_num/$total]${NC} Completed ${YELLOW}$task_id${NC} in ${duration_min}m${duration_sec}s"
    elif [ $exit_code -eq 124 ]; then
        log "${RED}[$task_num/$total]${NC} Timeout on ${YELLOW}$task_id${NC} after ${TIMEOUT_MINS}m"
    else
        log "${RED}[$task_num/$total]${NC} Failed ${YELLOW}$task_id${NC} (exit: $exit_code) after ${duration_min}m${duration_sec}s"
    fi

    # Memory cleanup
    sync
    sleep 3

    return $exit_code
}

# Main execution
main() {
    cd "$WORK_DIR"

    log "${BLUE}=== Autonomous Worker Started ===${NC}"
    [ -n "$PATTERN" ] && log "Filter pattern: $PATTERN"

    # Get initial task list
    local tasks
    tasks=$(get_ready_tasks)

    if [ -z "$tasks" ]; then
        log "${YELLOW}No ready tasks found${NC}"
        exit 0
    fi

    local task_array=()
    while IFS= read -r task; do
        [ -n "$task" ] && task_array+=("$task")
    done <<< "$tasks"

    local total=${#task_array[@]}

    # Apply max limit if set
    if [ "$MAX_TASKS" -gt 0 ] && [ "$total" -gt "$MAX_TASKS" ]; then
        total=$MAX_TASKS
        log "Limiting to $MAX_TASKS tasks"
    fi

    log "Found ${GREEN}$total${NC} task(s) to process"

    # Dry run - just show what would be done
    if [ "$DRY_RUN" = true ]; then
        log "${YELLOW}DRY RUN - would process:${NC}"
        for i in "${!task_array[@]}"; do
            [ "$MAX_TASKS" -gt 0 ] && [ "$i" -ge "$MAX_TASKS" ] && break
            local task="${task_array[$i]}"
            local title=$(get_task_title "$task")
            echo "  $((i+1)). $task: $title"
        done
        exit 0
    fi

    # Process tasks
    local completed=0
    local failed=0

    for i in "${!task_array[@]}"; do
        [ "$MAX_TASKS" -gt 0 ] && [ "$i" -ge "$MAX_TASKS" ] && break

        local task="${task_array[$i]}"
        local task_num=$((i + 1))

        # Run in subshell for isolation
        if (run_task "$task" "$task_num" "$total"); then
            ((completed++))
        else
            ((failed++))
        fi

        # Re-sync with bd between tasks
        bd sync 2>/dev/null || true
    done

    # Summary
    log "${BLUE}=== Autonomous Worker Complete ===${NC}"
    log "Completed: ${GREEN}$completed${NC} | Failed: ${RED}$failed${NC} | Total: $total"

    # Final push to make sure everything is synced
    log "Final sync..."
    git pull --rebase 2>/dev/null || true
    bd sync 2>/dev/null || true
    git push 2>/dev/null || log "${YELLOW}Nothing to push${NC}"

    log "${GREEN}Done!${NC}"
}

main "$@"
