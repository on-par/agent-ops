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
#   --dry-run              Show tasks without executing
#   --max N                Maximum number of tasks to run
#   --timeout M            Timeout per phase in minutes (default: 30)
#   --model M              Model for ALL phases: sonnet, opus, haiku
#   --research-model M     Model for research phase (default: sonnet)
#   --plan-model M         Model for plan phase (default: sonnet)
#   --implement-model M    Model for implement phase (default: haiku)
#   --validator-model M    Model for FAR/FACTS validation (default: sonnet)
#   --max-retries N        Max validation retries per phase (default: 2)
#   --help                 Show this help
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
DEFAULT_TIMEOUT=300
MAX_TASKS=0
CLAUDE_CMD="${CLAUDE_CMD:-claude}"
MAX_WAIT_SECONDS=3600  # 1 hour - exit if cooldown exceeds this

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
RESEARCH_MODEL="sonnet"
PLAN_MODEL="sonnet"
IMPLEMENT_MODEL="haiku"
VALIDATOR_MODEL="haiku"
MAX_VALIDATION_RETRIES=2

show_help() {
    head -24 "$0" | tail -22 | sed 's/^# //' | sed 's/^#//'
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
            # Set all phase models at once
            RESEARCH_MODEL="$2"
            PLAN_MODEL="$2"
            IMPLEMENT_MODEL="$2"
            shift 2
            ;;
        --research-model)
            RESEARCH_MODEL="$2"
            shift 2
            ;;
        --plan-model)
            PLAN_MODEL="$2"
            shift 2
            ;;
        --implement-model)
            IMPLEMENT_MODEL="$2"
            shift 2
            ;;
        --validator-model)
            VALIDATOR_MODEL="$2"
            shift 2
            ;;
        --max-retries)
            MAX_VALIDATION_RETRIES="$2"
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

# Check if output indicates rate limiting and extract wait time
# Returns: 0 if rate limited (sets RATE_LIMIT_SECONDS), 1 if not rate limited
check_rate_limit() {
    local output="$1"
    RATE_LIMIT_SECONDS=0

    # Check for common rate limit patterns
    # Pattern 1: "retry after X seconds"
    if echo "$output" | grep -qi "rate.limit\|too.many.requests\|429\|overloaded"; then
        # Try to extract seconds from various patterns
        local seconds=""

        # Pattern: "retry after 123 seconds" or "wait 123 seconds"
        seconds=$(echo "$output" | grep -oiE "(retry|wait).*(after|for)?\s*[0-9]+" | grep -oE "[0-9]+" | head -1)

        # Pattern: "retry-after: 123" header style
        if [ -z "$seconds" ]; then
            seconds=$(echo "$output" | grep -oiE "retry-after:?\s*[0-9]+" | grep -oE "[0-9]+" | head -1)
        fi

        # Pattern: "in X minutes" - convert to seconds
        if [ -z "$seconds" ]; then
            local minutes
            minutes=$(echo "$output" | grep -oiE "in\s+[0-9]+\s+minute" | grep -oE "[0-9]+" | head -1)
            if [ -n "$minutes" ]; then
                seconds=$((minutes * 60))
            fi
        fi

        # Pattern: "reset at HH:MM:SS" or timestamp - calculate difference
        if [ -z "$seconds" ]; then
            local reset_time
            reset_time=$(echo "$output" | grep -oiE "reset.*(at|in)?\s*[0-9]{1,2}:[0-9]{2}" | grep -oE "[0-9]{1,2}:[0-9]{2}" | head -1)
            if [ -n "$reset_time" ]; then
                local now_secs reset_secs
                now_secs=$(date +%s)
                reset_secs=$(date -j -f "%H:%M" "$reset_time" +%s 2>/dev/null || date -d "$reset_time" +%s 2>/dev/null || echo "")
                if [ -n "$reset_secs" ] && [ "$reset_secs" -gt "$now_secs" ]; then
                    seconds=$((reset_secs - now_secs))
                fi
            fi
        fi

        # Default fallback: 60 seconds if we detected rate limit but couldn't parse time
        if [ -z "$seconds" ] || [ "$seconds" -eq 0 ]; then
            seconds=60
        fi

        RATE_LIMIT_SECONDS=$seconds
        return 0
    fi

    return 1
}

# Handle rate limit: wait if under threshold, exit gracefully if over
# Returns: 0 if waited and ready to retry, 1 if should exit
handle_rate_limit() {
    local wait_seconds="$1"
    local context="$2"

    if [ "$wait_seconds" -gt "$MAX_WAIT_SECONDS" ]; then
        local wait_mins=$((wait_seconds / 60))
        local max_mins=$((MAX_WAIT_SECONDS / 60))
        log "${RED}[RATE LIMIT]${NC} Cooldown ${wait_mins}m exceeds max wait ${max_mins}m"
        log "${YELLOW}[RATE LIMIT]${NC} Gracefully exiting. Resume later with: $0 $PATTERN"
        return 1
    fi

    local wait_mins=$((wait_seconds / 60))
    local wait_secs=$((wait_seconds % 60))
    log "${YELLOW}[RATE LIMIT]${NC} Hit rate limit during $context"
    log "${YELLOW}[RATE LIMIT]${NC} Waiting ${wait_mins}m${wait_secs}s before retry..."

    # Show countdown every 30 seconds for long waits
    local remaining=$wait_seconds
    while [ "$remaining" -gt 0 ]; do
        if [ "$remaining" -gt 30 ]; then
            sleep 30
            remaining=$((remaining - 30))
            local r_mins=$((remaining / 60))
            local r_secs=$((remaining % 60))
            log "${YELLOW}[RATE LIMIT]${NC} ${r_mins}m${r_secs}s remaining..."
        else
            sleep "$remaining"
            remaining=0
        fi
    done

    log "${GREEN}[RATE LIMIT]${NC} Cooldown complete, resuming..."
    return 0
}

# Wrapper to run claude with rate limit handling
# Usage: run_claude_with_limit "context" "prompt" "model" "allowed_tools" "output_var_name"
# Returns: 0 on success, 1 on failure, 2 on rate limit exit
run_claude_with_limit() {
    local context="$1"
    local prompt="$2"
    local model="$3"
    local allowed_tools="$4"
    local timeout_mins="$5"
    local log_file="$6"

    local max_rate_limit_retries=3
    local attempt=0

    while [ "$attempt" -lt "$max_rate_limit_retries" ]; do
        ((attempt++))

        local output
        local exit_code=0

        # Run claude and capture output
        if [ -n "$allowed_tools" ]; then
            output=$(timeout "${timeout_mins}m" $CLAUDE_CMD -p "$prompt" \
                --model "$model" \
                --allowedTools "$allowed_tools" \
                2>&1) || exit_code=$?
        else
            output=$(timeout "${timeout_mins}m" $CLAUDE_CMD -p "$prompt" \
                --model "$model" \
                2>&1) || exit_code=$?
        fi

        # Save output to log
        echo "$output" >> "$log_file"

        # Check for rate limiting
        if check_rate_limit "$output"; then
            log "${YELLOW}[RATE LIMIT]${NC} Detected during $context (attempt $attempt/$max_rate_limit_retries)"

            if ! handle_rate_limit "$RATE_LIMIT_SECONDS" "$context"; then
                # Cooldown too long, exit gracefully
                return 2
            fi
            # Cooldown complete, retry
            continue
        fi

        # Also check exit code 1 with rate limit in case it's in stderr
        if [ "$exit_code" -ne 0 ]; then
            # Check if it might be a rate limit we missed
            if echo "$output" | grep -qi "rate\|limit\|429\|overload"; then
                if check_rate_limit "$output"; then
                    if ! handle_rate_limit "$RATE_LIMIT_SECONDS" "$context"; then
                        return 2
                    fi
                    continue
                fi
            fi
        fi

        # Return the output via stdout and the exit code
        echo "$output"
        return $exit_code
    done

    log "${RED}[RATE LIMIT]${NC} Exceeded max rate limit retries for $context"
    return 1
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
    local task_title="${2:-}"
    local log_file="$LOG_DIR/${task_id}-research-$(date +%Y%m%d-%H%M%S).log"
    local output_file="$TMP_DIR/${task_id}-research.md"

    log "${CYAN}[RESEARCH]${NC} Starting research for ${YELLOW}$task_id${NC}"
    [ -n "$task_title" ] && log "  ${CYAN}$task_title${NC}"

    # Get bead details
    local bead_info
    bead_info=$(bd show "$task_id" 2>/dev/null)

    # Include validation feedback if this is a retry
    local feedback_section=""
    if [ -n "${RESEARCH_FEEDBACK:-}" ]; then
        feedback_section="
# ⚠️ PREVIOUS ATTEMPT FAILED VALIDATION

Your previous research did not pass the FAR Scale validation. Here is the feedback:

$RESEARCH_FEEDBACK

Please address these issues in this attempt.

---
"
    fi

    local prompt="You are researching issue $task_id to understand how to solve it.
$feedback_section
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

    local output
    local exit_code=0
    output=$(run_claude_with_limit \
        "research:$task_id" \
        "$prompt" \
        "$RESEARCH_MODEL" \
        "Read,Glob,Grep,Task,TodoWrite,WebSearch,WebFetch" \
        "$TIMEOUT_MINS" \
        "$log_file") || exit_code=$?

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Check for graceful exit due to rate limit
    if [ $exit_code -eq 2 ]; then
        log "${YELLOW}[RESEARCH]${NC} Stopping due to rate limit"
        return 2
    fi

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
    local task_title="${2:-}"
    local log_file="$LOG_DIR/${task_id}-plan-$(date +%Y%m%d-%H%M%S).log"
    local output_file="$TMP_DIR/${task_id}-plan.md"
    local research_file="$TMP_DIR/${task_id}-research.md"

    log "${MAGENTA}[PLAN]${NC} Creating plan for ${YELLOW}$task_id${NC}"
    [ -n "$task_title" ] && log "  ${CYAN}$task_title${NC}"

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

    # Include validation feedback if this is a retry
    local feedback_section=""
    if [ -n "${PLAN_FEEDBACK:-}" ]; then
        feedback_section="
# ⚠️ PREVIOUS ATTEMPT FAILED VALIDATION

Your previous plan did not pass the FACTS Scale validation. Here is the feedback:

$PLAN_FEEDBACK

Please address these issues in this attempt.

---
"
    fi

    local prompt="You are creating an implementation plan for issue $task_id.
$feedback_section

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

    local output
    local exit_code=0
    output=$(run_claude_with_limit \
        "plan:$task_id" \
        "$prompt" \
        "$PLAN_MODEL" \
        "Read,Glob,Grep,Task,TodoWrite" \
        "$TIMEOUT_MINS" \
        "$log_file") || exit_code=$?

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Check for graceful exit due to rate limit
    if [ $exit_code -eq 2 ]; then
        log "${YELLOW}[PLAN]${NC} Stopping due to rate limit"
        return 2
    fi

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
    local task_title="${2:-}"
    local log_file="$LOG_DIR/${task_id}-implement-$(date +%Y%m%d-%H%M%S).log"
    local plan_file="$TMP_DIR/${task_id}-plan.md"

    log "${BLUE}[IMPLEMENT]${NC} Implementing ${YELLOW}$task_id${NC}"
    [ -n "$task_title" ] && log "  ${CYAN}$task_title${NC}"

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

    local prompt="You are autonomously implementing issue $task_id.

ISSUE DETAILS:
$bead_info

COMMENTS (includes research):
$bead_comments

IMPLEMENTATION PLAN:
$plan_content

$design_content

# Implementation Steps

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
   - Run: git push (IMPORTANT - always push your work)
   - Work is NOT complete until git push succeeds

6. Close the issue: bd close $task_id

7. CLEANUP (CRITICAL):
   - Kill any processes you started (dev servers, watchers, etc.)
   - Use 'pkill -f' or 'kill' to terminate processes
   - Check with 'ps aux | grep node' before finishing
   - Do NOT leave orphaned processes running

GUIDELINES:
- Follow existing code patterns in the codebase
- Don't over-engineer - implement what's specified
- If blocked or uncertain, document why and move on
- Keep commits focused and atomic

Begin implementation now."

    local start_time=$(date +%s)

    # Longer timeout for implementation
    local impl_timeout=$((TIMEOUT_MINS * 2))

    local output
    local exit_code=0
    output=$(run_claude_with_limit \
        "implement:$task_id" \
        "$prompt" \
        "$IMPLEMENT_MODEL" \
        "Read,Write,Edit,Bash,Glob,Grep,Task,TodoWrite" \
        "$impl_timeout" \
        "$log_file") || exit_code=$?

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Check for graceful exit due to rate limit
    if [ $exit_code -eq 2 ]; then
        log "${YELLOW}[IMPLEMENT]${NC} Stopping due to rate limit"
        return 2
    fi

    if [ $exit_code -eq 0 ]; then
        log "${GREEN}[IMPLEMENT]${NC} Completed in $((duration/60))m$((duration%60))s"
        return 0
    else
        log "${RED}[IMPLEMENT]${NC} Failed after $((duration/60))m$((duration%60))s"
        return 1
    fi
}

# FAR Scale Validator (Research phase)
# Validates: Factual, Actionable, Relevant
validate_far_scale() {
    local task_id="$1"
    local research_file="$2"
    local feedback_file="$TMP_DIR/${task_id}-far-feedback.md"

    if [ ! -f "$research_file" ]; then
        log "${RED}[FAR]${NC} Research file not found: $research_file"
        return 1
    fi

    local research_content
    research_content=$(cat "$research_file")

    local bead_info
    bead_info=$(bd show "$task_id" 2>/dev/null)

    local prompt="You are a research quality validator using the FAR Scale.

ORIGINAL ISSUE:
$bead_info

RESEARCH DOCUMENT TO VALIDATE:
$research_content

---

# FAR Scale Validation

Evaluate the research document against each criterion. Be strict but fair.

## Criteria

### F - Factual
- Is the research based on actual evidence (code found, docs read, web sources)?
- Are claims supported by specific file paths, line numbers, or URLs?
- Are there any hallucinated or unverified claims?

### A - Actionable
- Does the research provide clear direction for planning?
- Are the findings specific enough to act on?
- Is there a concrete proposed approach?

### R - Relevant
- Does the research address the actual problem in the issue?
- Is the scope appropriate (not too broad, not too narrow)?
- Are the findings useful for THIS specific task?

---

# Your Response

First, evaluate each criterion with a score 1-5 and brief justification.

Then output EXACTLY one of these verdicts on its own line:
- VALIDATION_PASSED - All criteria scored 3+ and research is ready for planning
- VALIDATION_FAILED - One or more criteria scored below 3

If VALIDATION_FAILED, provide specific feedback on what needs improvement.

Example format:
\`\`\`
## Factual: 4/5
Evidence is well-sourced with file paths. Minor gap in web research citations.

## Actionable: 5/5
Clear proposed approach with specific implementation steps.

## Relevant: 3/5
Addresses the issue but includes some tangential exploration.

VALIDATION_PASSED
\`\`\`

Or if failing:
\`\`\`
## Factual: 2/5
Multiple claims without evidence. No file paths provided for existing code analysis.

## Actionable: 4/5
Good direction but missing specifics.

## Relevant: 4/5
On topic.

VALIDATION_FAILED

**Feedback for retry:**
- Add specific file paths for all code references
- Include URLs for web research claims
- Verify the authentication module location before planning
\`\`\`"

    log "${CYAN}[FAR]${NC} Validating research for ${YELLOW}$task_id${NC}"

    local validation_output
    local exit_code=0
    validation_output=$(run_claude_with_limit \
        "FAR-validation:$task_id" \
        "$prompt" \
        "$VALIDATOR_MODEL" \
        "" \
        5 \
        "$feedback_file") || exit_code=$?

    # Save full output for debugging
    echo "$validation_output" > "$feedback_file"

    # Check for graceful exit due to rate limit
    if [ $exit_code -eq 2 ]; then
        log "${YELLOW}[FAR]${NC} Stopping due to rate limit"
        return 2
    fi

    # Check for pass/fail
    if echo "$validation_output" | grep -q "VALIDATION_PASSED"; then
        log "${GREEN}[FAR]${NC} Validation PASSED"
        return 0
    else
        log "${YELLOW}[FAR]${NC} Validation FAILED - see $feedback_file"
        return 1
    fi
}

# FACTS Scale Validator (Plan phase)
# Validates: Feasible, Atomic, Clear, Testable, Scoped
validate_facts_scale() {
    local task_id="$1"
    local plan_file="$2"
    local feedback_file="$TMP_DIR/${task_id}-facts-feedback.md"

    if [ ! -f "$plan_file" ]; then
        log "${RED}[FACTS]${NC} Plan file not found: $plan_file"
        return 1
    fi

    local plan_content
    plan_content=$(cat "$plan_file")

    local bead_info
    bead_info=$(bd show "$task_id" 2>/dev/null)

    local prompt="You are a plan quality validator using the FACTS Scale.

ORIGINAL ISSUE:
$bead_info

IMPLEMENTATION PLAN TO VALIDATE:
$plan_content

---

# FACTS Scale Validation

Evaluate the plan against each criterion. Be strict but fair.

## Criteria

### F - Feasible
- Can each task be realistically implemented?
- Are dependencies and prerequisites identified?
- Are there any tasks that seem impossible or require unavailable resources?

### A - Atomic
- Are tasks small enough to complete without losing context?
- Can each task be done in a single focused session?
- Are there any mega-tasks that should be broken down further?

### C - Clear
- Are instructions unambiguous?
- Would a developer know exactly what to do for each task?
- Are file paths, function names, and specific changes identified?

### T - Testable
- Does each task have clear success criteria?
- Can you verify when a task is \"done\"?
- Are test cases or validation steps included?

### S - Scoped
- Is the plan properly bounded to the original issue?
- Is there scope creep (extra features, unnecessary refactoring)?
- Does the plan do exactly what was asked, no more, no less?

---

# Your Response

First, evaluate each criterion with a score 1-5 and brief justification.

Then output EXACTLY one of these verdicts on its own line:
- VALIDATION_PASSED - All criteria scored 3+ and plan is ready for implementation
- VALIDATION_FAILED - One or more criteria scored below 3

If VALIDATION_FAILED, provide specific feedback on what needs improvement.

Example format:
\`\`\`
## Feasible: 4/5
All tasks are implementable. Dependencies correctly identified.

## Atomic: 3/5
Most tasks are well-sized. Task 2.3 could be split further.

## Clear: 5/5
Excellent specificity with file paths and code snippets.

## Testable: 4/5
Good test coverage. Could add edge case tests.

## Scoped: 5/5
Stays focused on the issue requirements.

VALIDATION_PASSED
\`\`\`

Or if failing:
\`\`\`
## Feasible: 4/5
Tasks are achievable.

## Atomic: 2/5
Phase 2 is too large - contains 8 subtasks that should be separate phases.

## Clear: 3/5
Adequate but some tasks lack specific file references.

## Testable: 2/5
No test cases defined. Success criteria missing for most tasks.

## Scoped: 4/5
Minor scope creep in Phase 3.

VALIDATION_FAILED

**Feedback for retry:**
- Break Phase 2 into 2-3 smaller phases
- Add specific test cases for each phase
- Define \"done\" criteria for every task
- Remove the optional refactoring in Phase 3
\`\`\`"

    log "${MAGENTA}[FACTS]${NC} Validating plan for ${YELLOW}$task_id${NC}"

    local validation_output
    local exit_code=0
    validation_output=$(run_claude_with_limit \
        "FACTS-validation:$task_id" \
        "$prompt" \
        "$VALIDATOR_MODEL" \
        "" \
        5 \
        "$feedback_file") || exit_code=$?

    # Save full output for debugging
    echo "$validation_output" > "$feedback_file"

    # Check for graceful exit due to rate limit
    if [ $exit_code -eq 2 ]; then
        log "${YELLOW}[FACTS]${NC} Stopping due to rate limit"
        return 2
    fi

    # Check for pass/fail
    if echo "$validation_output" | grep -q "VALIDATION_PASSED"; then
        log "${GREEN}[FACTS]${NC} Validation PASSED"
        return 0
    else
        log "${YELLOW}[FACTS]${NC} Validation FAILED - see $feedback_file"
        return 1
    fi
}

# Check if research already exists in bead
has_research() {
    local task_id="$1"
    # Check for research markers in comments
    if bd comments "$task_id" 2>/dev/null | grep -qE "Problem Overview|Proposed Solution|Codebase Analysis"; then
        return 0
    fi
    return 1
}

# Check if plan already exists in bead
has_plan() {
    local task_id="$1"
    # Check design field or plan markers in comments
    local design
    design=$(bd show "$task_id" --json 2>/dev/null | grep -o '"design":"[^"]*"' | sed 's/"design":"//; s/"$//' || echo "")
    if [ -n "$design" ] && [ "$design" != "null" ]; then
        return 0
    fi
    # Also check comments for plan markers
    if bd comments "$task_id" 2>/dev/null | grep -qE "Implementation Phases|## Phase [0-9]"; then
        return 0
    fi
    return 1
}

# Generate implementation summary
generate_summary() {
    local task_id="$1"
    local task_title="$2"

    # Get recent git changes
    local changes
    changes=$(git diff --stat HEAD~1 2>/dev/null | tail -10 || echo "No recent commits")

    local files_changed
    files_changed=$(git diff --name-only HEAD~1 2>/dev/null | head -10 || echo "")

    local prompt="Summarize what was implemented in 2-3 concise sentences.

Task: $task_title

Files changed:
$files_changed

Stats:
$changes

Focus on what user-visible changes were made. Be brief and specific."

    local summary
    summary=$(timeout 2m $CLAUDE_CMD -p "$prompt" --model haiku 2>&1) || summary="Implementation completed."

    echo "$summary"
}

# Run full RPI cycle for a task
run_rpi_cycle() {
    local task_id="$1"
    local task_num="$2"
    local total="$3"
    local task_title
    task_title=$(get_task_title "$task_id")

    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${BLUE}[$task_num/$total]${NC} ${YELLOW}$task_id${NC}"
    log "  ${CYAN}$task_title${NC}"
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Mark as in progress
    bd update "$task_id" --status in_progress 2>/dev/null || true

    local research_file="$TMP_DIR/${task_id}-research.md"
    local plan_file="$TMP_DIR/${task_id}-plan.md"
    local far_feedback="$TMP_DIR/${task_id}-far-feedback.md"
    local facts_feedback="$TMP_DIR/${task_id}-facts-feedback.md"

    # ═══════════════════════════════════════════════════════════════════
    # Resume Detection - Check what's already done
    # ═══════════════════════════════════════════════════════════════════
    local skip_research=false
    local skip_plan=false

    if has_research "$task_id"; then
        skip_research=true
        log "${GREEN}[RESUME]${NC} Research already exists, skipping to planning"
    fi

    if has_plan "$task_id"; then
        skip_plan=true
        log "${GREEN}[RESUME]${NC} Plan already exists, skipping to implementation"
    fi

    # ═══════════════════════════════════════════════════════════════════
    # Phase 1: Research with FAR Validation Loop
    # ═══════════════════════════════════════════════════════════════════
    local research_attempts=0
    local research_validated=false
    local phase_exit_code=0

    if [ "$skip_research" = true ]; then
        research_validated=true
        log "${CYAN}[RESEARCH]${NC} Using existing research from bead"
    fi

    while [ "$research_attempts" -le "$MAX_VALIDATION_RETRIES" ] && [ "$research_validated" = false ]; do
        ((research_attempts++))
        log "${CYAN}[RESEARCH]${NC} Attempt $research_attempts/$((MAX_VALIDATION_RETRIES + 1))"

        # Run research (pass feedback from previous attempt if exists)
        if [ -f "$far_feedback" ] && [ "$research_attempts" -gt 1 ]; then
            # Inject previous feedback into research phase
            export RESEARCH_FEEDBACK=$(cat "$far_feedback")
        fi

        phase_exit_code=0
        run_research_phase "$task_id" "$task_title" || phase_exit_code=$?

        # Check for rate limit exit
        if [ $phase_exit_code -eq 2 ]; then
            unset RESEARCH_FEEDBACK
            return 2
        fi

        if [ $phase_exit_code -ne 0 ]; then
            log "${RED}[$task_num/$total]${NC} Research execution failed for $task_id"
            continue
        fi

        # Validate with FAR Scale
        phase_exit_code=0
        validate_far_scale "$task_id" "$research_file" || phase_exit_code=$?

        # Check for rate limit exit
        if [ $phase_exit_code -eq 2 ]; then
            unset RESEARCH_FEEDBACK
            return 2
        fi

        if [ $phase_exit_code -eq 0 ]; then
            research_validated=true
            log "${GREEN}[RESEARCH]${NC} FAR validation passed on attempt $research_attempts"
        else
            if [ "$research_attempts" -le "$MAX_VALIDATION_RETRIES" ]; then
                log "${YELLOW}[RESEARCH]${NC} FAR validation failed, will retry..."
                # Keep feedback file for next iteration
            else
                log "${RED}[RESEARCH]${NC} FAR validation failed after $research_attempts attempts"
            fi
        fi
    done

    unset RESEARCH_FEEDBACK

    if [ "$research_validated" = false ]; then
        log "${RED}[$task_num/$total]${NC} Research validation failed for $task_id after $research_attempts attempts"
        return 1
    fi

    # ═══════════════════════════════════════════════════════════════════
    # Phase 2: Plan with FACTS Validation Loop
    # ═══════════════════════════════════════════════════════════════════
    local plan_attempts=0
    local plan_validated=false

    if [ "$skip_plan" = true ]; then
        plan_validated=true
        log "${MAGENTA}[PLAN]${NC} Using existing plan from bead"
    fi

    while [ "$plan_attempts" -le "$MAX_VALIDATION_RETRIES" ] && [ "$plan_validated" = false ]; do
        ((plan_attempts++))
        log "${MAGENTA}[PLAN]${NC} Attempt $plan_attempts/$((MAX_VALIDATION_RETRIES + 1))"

        # Run planning (pass feedback from previous attempt if exists)
        if [ -f "$facts_feedback" ] && [ "$plan_attempts" -gt 1 ]; then
            export PLAN_FEEDBACK=$(cat "$facts_feedback")
        fi

        phase_exit_code=0
        run_plan_phase "$task_id" "$task_title" || phase_exit_code=$?

        # Check for rate limit exit
        if [ $phase_exit_code -eq 2 ]; then
            unset PLAN_FEEDBACK
            return 2
        fi

        if [ $phase_exit_code -ne 0 ]; then
            log "${RED}[$task_num/$total]${NC} Planning execution failed for $task_id"
            continue
        fi

        # Validate with FACTS Scale
        phase_exit_code=0
        validate_facts_scale "$task_id" "$plan_file" || phase_exit_code=$?

        # Check for rate limit exit
        if [ $phase_exit_code -eq 2 ]; then
            unset PLAN_FEEDBACK
            return 2
        fi

        if [ $phase_exit_code -eq 0 ]; then
            plan_validated=true
            log "${GREEN}[PLAN]${NC} FACTS validation passed on attempt $plan_attempts"
        else
            if [ "$plan_attempts" -le "$MAX_VALIDATION_RETRIES" ]; then
                log "${YELLOW}[PLAN]${NC} FACTS validation failed, will retry..."
            else
                log "${RED}[PLAN]${NC} FACTS validation failed after $plan_attempts attempts"
            fi
        fi
    done

    unset PLAN_FEEDBACK

    if [ "$plan_validated" = false ]; then
        log "${RED}[$task_num/$total]${NC} Plan validation failed for $task_id after $plan_attempts attempts"
        return 1
    fi

    # ═══════════════════════════════════════════════════════════════════
    # Phase 3: Implement (no validation loop - uses quality gates)
    # ═══════════════════════════════════════════════════════════════════
    phase_exit_code=0
    run_implement_phase "$task_id" "$task_title" || phase_exit_code=$?

    # Check for rate limit exit
    if [ $phase_exit_code -eq 2 ]; then
        return 2
    fi

    if [ $phase_exit_code -ne 0 ]; then
        log "${RED}[$task_num/$total]${NC} Implementation failed for $task_id"
        return 1
    fi

    # Close the bead
    bd close "$task_id" 2>/dev/null || true

    # Final push
    git push 2>/dev/null || log "${YELLOW}Nothing to push${NC}"

    # Generate and display summary
    log "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${GREEN}[$task_num/$total]${NC} ✓ Completed: ${YELLOW}$task_id${NC}"
    log "  ${CYAN}$task_title${NC}"
    log ""
    log "${GREEN}Summary:${NC}"
    local summary
    summary=$(generate_summary "$task_id" "$task_title" 2>/dev/null || echo "Implementation completed.")
    # Log each line of summary with indentation
    echo "$summary" | while IFS= read -r line; do
        log "  $line"
    done
    log ""
    local research_status="$research_attempts attempt(s)"
    local plan_status="$plan_attempts attempt(s)"
    [ "$skip_research" = true ] && research_status="skipped (existing)"
    [ "$skip_plan" = true ] && plan_status="skipped (existing)"
    log "  ${BLUE}Phases:${NC} Research: $research_status | Plan: $plan_status"
    log "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

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
    log "Models: research=$RESEARCH_MODEL, plan=$PLAN_MODEL, implement=$IMPLEMENT_MODEL | Validator: $VALIDATOR_MODEL"
    log "Timeout: ${TIMEOUT_MINS}m | Max retries: $MAX_VALIDATION_RETRIES"
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
        log "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        log "${YELLOW}DRY RUN${NC} - would process the following tasks:"
        log "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        for i in "${!task_array[@]}"; do
            [ "$MAX_TASKS" -gt 0 ] && [ "$i" -ge "$MAX_TASKS" ] && break
            local task="${task_array[$i]}"
            local title=$(get_task_title "$task")
            local has_r="" has_p=""
            has_research "$task" && has_r="${GREEN}R${NC}" || has_r="${RED}R${NC}"
            has_plan "$task" && has_p="${GREEN}P${NC}" || has_p="${RED}P${NC}"
            echo -e "  $((i+1)). ${YELLOW}$task${NC} [$has_r$has_p]"
            echo -e "     ${CYAN}$title${NC}"
        done
        log ""
        log "Legend: ${GREEN}R${NC}=research exists, ${RED}R${NC}=needs research"
        log "        ${GREEN}P${NC}=plan exists, ${RED}P${NC}=needs planning"
        log "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        exit 0
    fi

    # Process tasks
    local completed=0
    local failed=0
    local rate_limited=false

    for i in "${!task_array[@]}"; do
        [ "$MAX_TASKS" -gt 0 ] && [ "$i" -ge "$MAX_TASKS" ] && break

        local task="${task_array[$i]}"
        local task_num=$((i + 1))

        local cycle_exit=0
        run_rpi_cycle "$task" "$task_num" "$total" || cycle_exit=$?

        if [ $cycle_exit -eq 0 ]; then
            ((completed++))
        elif [ $cycle_exit -eq 2 ]; then
            # Rate limit - graceful exit
            rate_limited=true
            log "${YELLOW}[RATE LIMIT]${NC} Stopping worker due to extended cooldown"
            break
        else
            ((failed++))
        fi

        # Sync between tasks
        bd sync 2>/dev/null || true
    done

    # Summary
    if [ "$rate_limited" = true ]; then
        log "${YELLOW}=== RPI Worker Paused (Rate Limited) ===${NC}"
        log "Completed: ${GREEN}$completed${NC} | Failed: ${RED}$failed${NC} | Remaining: $((total - completed - failed))"
        log "${YELLOW}Resume later with:${NC} $0 $PATTERN"
    else
        log "${BLUE}=== RPI Worker Complete ===${NC}"
        log "Completed: ${GREEN}$completed${NC} | Failed: ${RED}$failed${NC} | Total: $total"
    fi

    # Final sync
    log "Final sync..."
    git pull --rebase 2>/dev/null || true
    bd sync 2>/dev/null || true
    git push 2>/dev/null || log "${YELLOW}Nothing to push${NC}"

    if [ "$rate_limited" = true ]; then
        log "${YELLOW}Exiting due to rate limit. Run again later.${NC}"
        exit 0  # Exit gracefully, not an error
    fi

    log "${GREEN}Done!${NC}"
}

main "$@"
