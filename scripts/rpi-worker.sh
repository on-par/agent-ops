#!/bin/bash
# rpi-worker.sh - Research -> Plan -> Implement autonomous worker
#
# Usage:
#   ./scripts/rpi-worker.sh              # Work first ready bead
#   ./scripts/rpi-worker.sh em3          # Only beads matching "em3"
#   ./scripts/rpi-worker.sh --dry-run    # Show what would run
#   ./scripts/rpi-worker.sh --max 3      # Limit to 3 tasks
#   CLAUDE_CMD=ccymcp ./scripts/rpi-worker.sh  # Use MCP-enabled claude
#
# Options:
#   --dry-run     Show tasks without executing
#   --max N       Maximum number of tasks to run
#   --timeout M   Timeout per phase in minutes (default: 30)
#   --model M     Model to use: sonnet, opus (default: sonnet)
#   --help        Show this help
#
# Environment:
#   CLAUDE_CMD    Claude command with flags (default: claude)
#                 Include --dangerously-skip-permissions if needed
#                 Include --mcp-config <path> for MCP servers

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${WORKER_DIR:-$(pwd)}"
LOG_DIR="$WORK_DIR/.claude-runs"
TMP_DIR="$WORK_DIR/.claude-runs/tmp"
DEFAULT_TIMEOUT=30
MAX_TASKS=0
CLAUDE_CMD="${CLAUDE_CMD:-claude}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
PATTERN=""
DRY_RUN=false
TIMEOUT_MINS=$DEFAULT_TIMEOUT
MODEL_CHOICE="sonnet"

show_help() {
    head -18 "$0" | tail -16 | sed 's/^# //' | sed 's/^#//'
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

mkdir -p "$LOG_DIR" "$TMP_DIR"

MAIN_LOG="$LOG_DIR/rpi-$(date '+%Y-%m-%d-%H-%M-%S').log"

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$MAIN_LOG"
}

# Get list of ready tasks
get_ready_tasks() {
    local tasks
    tasks=$(bd ready --limit 100 2>/dev/null | grep -E '^\s*[0-9]+\.' | sed 's/.*] //' | cut -d: -f1)

    if [ -n "$PATTERN" ]; then
        echo "$tasks" | grep -E "$PATTERN" || true
    else
        echo "$tasks"
    fi
}

# Get task title
get_task_title() {
    local task_id="$1"
    bd show "$task_id" --json 2>/dev/null | grep '"title"' | head -1 | sed 's/.*"title": "//; s/",$//; s/"$//'
}

# Phase 1: Research
run_research_phase() {
    local task_id="$1"
    local log_file="$LOG_DIR/${task_id}-research-$(date +%Y%m%d-%H%M%S).log"
    local output_file="$TMP_DIR/${task_id}-research.md"

    log "${CYAN}[RESEARCH]${NC} Starting research for ${YELLOW}$task_id${NC}"

    # Get bead details
    local bead_info
    bead_info=$(bd show "$task_id" 2>/dev/null)

    local prompt="You are researching issue $task_id to understand how to solve it.

ISSUE DETAILS:
$bead_info

# Research Instructions

Perform the following research tasks IN PARALLEL using the Task tool:

1. **Web Research**: Launch the web-research-specialist agent to:
   - Find best practices, libraries, and solutions for this problem
   - Gather relevant documentation and examples
   - Identify common patterns and approaches

2. **Codebase Analysis**: Launch the codebase-solution-researcher agent to:
   - Analyze existing code patterns in the codebase
   - Identify files and components that will be affected
   - Understand current architecture and how to integrate the solution
   - Find existing similar implementations to build upon

# Output Requirements

After both agents complete, synthesize their findings into a research document with these sections:

## 1. Problem Overview
- Clear problem statement
- Key objectives
- Success criteria

## 2. Web Research Findings
- Recommended approaches and patterns
- Relevant libraries/frameworks/tools
- Best practices
- Code examples from documentation

## 3. Codebase Analysis
- Affected files (with file paths and line numbers where relevant)
- Existing patterns to follow
- Current architecture considerations
- Dependencies and imports needed

## 4. Proposed Solution Approach
- High-level solution strategy
- Key implementation steps
- Technology/library choices with justification

## 5. Next Steps
- Prerequisites that must be in place
- Recommended implementation order
- Testing considerations

Write the complete research document to: $output_file

This research will be stored in the bead and used for the planning phase."

    local start_time=$(date +%s)

    if timeout "${TIMEOUT_MINS}m" $CLAUDE_CMD -p "$prompt" \
        --model "$MODEL_CHOICE" \
        --allowedTools "Read,Glob,Grep,Task,TodoWrite,WebSearch,WebFetch" \
        2>&1 | tee "$log_file"; then
        local exit_code=0
    else
        local exit_code=$?
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ] && [ -f "$output_file" ]; then
        # Store research in bead as a comment
        bd comments add "$task_id" -f "$output_file" 2>/dev/null || \
            bd update "$task_id" --notes "$(cat "$output_file")" 2>/dev/null || true
        log "${GREEN}[RESEARCH]${NC} Completed in $((duration/60))m$((duration%60))s"
        return 0
    else
        log "${RED}[RESEARCH]${NC} Failed after $((duration/60))m$((duration%60))s"
        return 1
    fi
}

# Phase 2: Plan
run_plan_phase() {
    local task_id="$1"
    local log_file="$LOG_DIR/${task_id}-plan-$(date +%Y%m%d-%H%M%S).log"
    local output_file="$TMP_DIR/${task_id}-plan.md"
    local research_file="$TMP_DIR/${task_id}-research.md"

    log "${MAGENTA}[PLAN]${NC} Creating plan for ${YELLOW}$task_id${NC}"

    # Get bead details including any research comments
    local bead_info
    bead_info=$(bd show "$task_id" 2>/dev/null)
    local bead_comments
    bead_comments=$(bd comments "$task_id" 2>/dev/null || echo "")

    # Also read research file if it exists
    local research_content=""
    if [ -f "$research_file" ]; then
        research_content=$(cat "$research_file")
    fi

    local prompt="You are creating an implementation plan for issue $task_id.

ISSUE DETAILS:
$bead_info

PREVIOUS COMMENTS (may include research):
$bead_comments

RESEARCH DOCUMENT:
$research_content

# Planning Instructions

1. Use the Task tool to launch the software-task-planner agent with all the context above.

2. Create a plan following this TDD-focused structure:

## Problem Summary
- Brief overview (1-2 sentences)

## Prerequisites
- Required dependencies or tools
- Environment setup needed
- Any blocking issues

## Implementation Phases

Aim for 3-5 phases. Each phase:

### Phase N: [Descriptive Title]

**Goal:** Single sentence describing what this phase accomplishes.

**Context:**
- Key file references
- Pattern references

**Tasks:**
Follow TDD Red-Green-Refactor:
- [ ] Write test for [specific behavior] (expect fail)
- [ ] Implement [specific behavior] (expect pass)
- [ ] Refactor if needed (keep passing)

## Appendix: Code Examples
Reference existing patterns or provide minimal snippets.

Write the complete plan to: $output_file

This plan will be stored in the bead and used for implementation."

    local start_time=$(date +%s)

    if timeout "${TIMEOUT_MINS}m" $CLAUDE_CMD -p "$prompt" \
        --model "$MODEL_CHOICE" \
        --allowedTools "Read,Glob,Grep,Task,TodoWrite" \
        2>&1 | tee "$log_file"; then
        local exit_code=0
    else
        local exit_code=$?
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ] && [ -f "$output_file" ]; then
        # Store plan in bead design field
        bd update "$task_id" --design "$(cat "$output_file")" 2>/dev/null || \
            bd comments add "$task_id" -f "$output_file" 2>/dev/null || true
        log "${GREEN}[PLAN]${NC} Completed in $((duration/60))m$((duration%60))s"
        return 0
    else
        log "${RED}[PLAN]${NC} Failed after $((duration/60))m$((duration%60))s"
        return 1
    fi
}

# Phase 3: Implement
run_implement_phase() {
    local task_id="$1"
    local log_file="$LOG_DIR/${task_id}-implement-$(date +%Y%m%d-%H%M%S).log"
    local plan_file="$TMP_DIR/${task_id}-plan.md"

    log "${BLUE}[IMPLEMENT]${NC} Implementing ${YELLOW}$task_id${NC}"

    # Get full bead context
    local bead_info
    bead_info=$(bd show "$task_id" 2>/dev/null)
    local bead_comments
    bead_comments=$(bd comments "$task_id" 2>/dev/null || echo "")

    # Read plan file if exists
    local plan_content=""
    if [ -f "$plan_file" ]; then
        plan_content=$(cat "$plan_file")
    fi

    # Get design field (where plan was stored)
    local design_content
    design_content=$(bd show "$task_id" --json 2>/dev/null | grep -o '"design":"[^"]*"' | sed 's/"design":"//; s/"$//' || echo "")

    local prompt="You are implementing issue $task_id.

ISSUE DETAILS:
$bead_info

COMMENTS (includes research):
$bead_comments

IMPLEMENTATION PLAN:
$plan_content

$design_content

# Implementation Instructions

1. Read and understand the plan above.

2. For each phase, implement the tasks following TDD:
   - Write the test first (expect it to fail)
   - Implement the code (expect test to pass)
   - Refactor if needed (keep tests passing)

3. Use specialized agents via Task tool when helpful:
   - frontend-specialist for UI components
   - backend-specialist for APIs and server logic
   - test-writer for test suites

4. After completing all phases:
   - Run tests: npm test (or appropriate test command)
   - Run build: npm run build (or appropriate build command)
   - Run lint: npm run lint (or appropriate lint command)
   - Fix any errors that appear

5. When ALL tests/build/lint pass:
   - Commit changes with descriptive message
   - Push to remote: git push

6. CLEANUP (CRITICAL):
   - Kill any processes you started (dev servers, watchers, etc.)
   - Use 'pkill -f' or 'kill' to terminate processes
   - Check with 'ps aux | grep node' before finishing
   - Do NOT leave orphaned processes running

Begin implementation now."

    local start_time=$(date +%s)

    # Longer timeout for implementation
    local impl_timeout=$((TIMEOUT_MINS * 2))

    if timeout "${impl_timeout}m" $CLAUDE_CMD -p "$prompt" \
        --model "$MODEL_CHOICE" \
        --allowedTools "Read,Write,Edit,Bash,Glob,Grep,Task,TodoWrite" \
        2>&1 | tee "$log_file"; then
        local exit_code=0
    else
        local exit_code=$?
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ]; then
        log "${GREEN}[IMPLEMENT]${NC} Completed in $((duration/60))m$((duration%60))s"
        return 0
    else
        log "${RED}[IMPLEMENT]${NC} Failed after $((duration/60))m$((duration%60))s"
        return 1
    fi
}

# Run full RPI cycle for a task
run_rpi_cycle() {
    local task_id="$1"
    local task_num="$2"
    local total="$3"

    log "${BLUE}[$task_num/$total]${NC} Starting RPI cycle for ${YELLOW}$task_id${NC}"

    # Mark as in progress
    bd update "$task_id" --status in_progress 2>/dev/null || true

    # Phase 1: Research
    if ! run_research_phase "$task_id"; then
        log "${RED}[$task_num/$total]${NC} Research failed for $task_id"
        return 1
    fi

    # Phase 2: Plan
    if ! run_plan_phase "$task_id"; then
        log "${RED}[$task_num/$total]${NC} Planning failed for $task_id"
        return 1
    fi

    # Phase 3: Implement
    if ! run_implement_phase "$task_id"; then
        log "${RED}[$task_num/$total]${NC} Implementation failed for $task_id"
        return 1
    fi

    # Close the bead
    bd close "$task_id" 2>/dev/null || true

    # Final push
    git push 2>/dev/null || log "${YELLOW}Nothing to push${NC}"

    log "${GREEN}[$task_num/$total]${NC} Completed RPI cycle for ${YELLOW}$task_id${NC}"

    # Cleanup temp files
    rm -f "$TMP_DIR/${task_id}-"*.md 2>/dev/null || true

    # Memory cleanup
    sync
    sleep 3

    return 0
}

# Main execution
main() {
    cd "$WORK_DIR"

    log "${BLUE}=== RPI Worker Started ===${NC}"
    log "Model: $MODEL_CHOICE | Timeout: ${TIMEOUT_MINS}m per phase"
    [ -n "$PATTERN" ] && log "Filter pattern: $PATTERN"

    # Get task list
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

    # Apply max limit
    if [ "$MAX_TASKS" -gt 0 ] && [ "$total" -gt "$MAX_TASKS" ]; then
        total=$MAX_TASKS
        log "Limiting to $MAX_TASKS tasks"
    fi

    log "Found ${GREEN}$total${NC} task(s) to process"

    # Dry run
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

        if (run_rpi_cycle "$task" "$task_num" "$total"); then
            ((completed++))
        else
            ((failed++))
        fi

        # Sync between tasks
        bd sync 2>/dev/null || true
    done

    # Summary
    log "${BLUE}=== RPI Worker Complete ===${NC}"
    log "Completed: ${GREEN}$completed${NC} | Failed: ${RED}$failed${NC} | Total: $total"

    # Final sync
    log "Final sync..."
    git pull --rebase 2>/dev/null || true
    bd sync 2>/dev/null || true
    git push 2>/dev/null || log "${YELLOW}Nothing to push${NC}"

    log "${GREEN}Done!${NC}"
}

main "$@"
