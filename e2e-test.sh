#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    # Kill any orphaned processes
    pkill -f "tsx watch.*agent-ops" 2>/dev/null || true
    pkill -f "vite.*agent-ops" 2>/dev/null || true
    echo -e "${GREEN}Cleanup complete${NC}"
}

trap cleanup EXIT

wait_for_url() {
    local url=$1
    local name=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -n "Waiting for $name at $url"
    while [ $attempt -le $max_attempts ]; do
        if curl -sk -o /dev/null -w "%{http_code}" "$url" 2>/dev/null | grep -qE "^[23]"; then
            echo -e " ${GREEN}ready${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        ((attempt++))
    done
    echo -e " ${RED}timeout${NC}"
    return 1
}

echo -e "${GREEN}=== Agent Ops E2E Test ===${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm not found. Install Node.js.${NC}"
    exit 1
fi

echo -e "${GREEN}Prerequisites OK${NC}"
echo ""

# Install e2e dependencies if needed
echo -e "${YELLOW}Installing E2E test dependencies...${NC}"
cd "$SCRIPT_DIR/e2e"
npm install --silent
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
cd "$SCRIPT_DIR"
echo -e "${GREEN}Dependencies installed${NC}"
echo ""

# Build backend
echo -e "${YELLOW}Building backend...${NC}"
cd "$SCRIPT_DIR/backend"
npm run build --silent
cd "$SCRIPT_DIR"
echo -e "${GREEN}Backend built${NC}"
echo ""

# Start backend
echo -e "${YELLOW}Starting backend...${NC}"
cd "$SCRIPT_DIR/backend"
PORT=3001 npm run dev > /tmp/backend-e2e.log 2>&1 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"
echo "Backend started (PID: $BACKEND_PID)"
echo ""

# Start frontend
echo -e "${YELLOW}Starting frontend...${NC}"
cd "$SCRIPT_DIR/frontend"
npm run dev > /tmp/frontend-e2e.log 2>&1 &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"
echo "Frontend started (PID: $FRONTEND_PID)"
echo ""

# Wait for services
echo -e "${YELLOW}Waiting for services...${NC}"

if ! wait_for_url "$BACKEND_URL/health" "Backend" 30; then
    echo -e "${RED}Backend failed to start${NC}"
    echo "Backend log:"
    tail -30 /tmp/backend-e2e.log
    exit 1
fi

if ! wait_for_url "$FRONTEND_URL" "Frontend" 30; then
    echo -e "${RED}Frontend failed to start${NC}"
    echo "Frontend log:"
    tail -30 /tmp/frontend-e2e.log
    exit 1
fi

echo ""
echo -e "${GREEN}All services ready!${NC}"
echo ""

# Run Playwright tests
echo -e "${YELLOW}Running Playwright tests...${NC}"
echo ""

cd "$SCRIPT_DIR/e2e"
export BACKEND_URL FRONTEND_URL
# No Aspire Dashboard for now - test backend and frontend only
export ASPIRE_DASHBOARD_URL=""

if npx playwright test --grep-invert "Aspire Dashboard"; then
    echo ""
    echo -e "${GREEN}=== All E2E tests passed! ===${NC}"
    EXIT_CODE=0
else
    echo ""
    echo -e "${RED}=== E2E tests failed ===${NC}"
    EXIT_CODE=1
fi

cd "$SCRIPT_DIR"
exit $EXIT_CODE
