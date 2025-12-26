#!/bin/bash
# Build script for agent container image
# Supports multi-platform builds (ARM64 and AMD64)
# Usage: ./scripts/build-agent-container.sh [VERSION] [--push]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
VERSION="${1:-latest}"
PUSH_FLAG=""

# Check for --push flag
if [ "$2" == "--push" ]; then
  PUSH_FLAG="--push"
fi

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo -e "${YELLOW}Building Agent Container Image${NC}"
echo "Version: $VERSION"
echo "Push to registry: ${PUSH_FLAG:-no}"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  echo -e "${RED}ERROR: Docker is not installed or not in PATH${NC}"
  exit 1
fi

# Check Docker daemon is running
if ! docker ps &> /dev/null; then
  echo -e "${RED}ERROR: Docker daemon is not running${NC}"
  exit 1
fi

echo -e "${YELLOW}Building Docker image...${NC}"

# Build the image
docker build \
  -f "$BACKEND_DIR/agent.Dockerfile" \
  -t "agent-ops/agent:$VERSION" \
  -t "agent-ops/agent:latest" \
  "$PROJECT_ROOT"

if [ $? -ne 0 ]; then
  echo -e "${RED}ERROR: Docker build failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo "Image tags:"
echo "  - agent-ops/agent:$VERSION"
echo "  - agent-ops/agent:latest"
echo ""

# Display image information
IMAGE_ID=$(docker images --quiet agent-ops/agent:latest)
IMAGE_SIZE=$(docker images --format "table {{.Repository}}\t{{.Size}}" agent-ops/agent:latest | tail -1)

echo "Image Details:"
echo "  ID: $IMAGE_ID"
echo "  Size: $IMAGE_SIZE"
echo ""

# Test the image by running it with --help-like output
echo -e "${YELLOW}Testing container startup...${NC}"
if docker run --rm agent-ops/agent:latest node -v &> /dev/null; then
  echo -e "${GREEN}✓ Container starts successfully${NC}"
else
  echo -e "${YELLOW}⚠ Warning: Container startup test failed${NC}"
fi

# Push to registry if requested
if [ -n "$PUSH_FLAG" ]; then
  echo -e "${YELLOW}Pushing to registry...${NC}"
  docker push "agent-ops/agent:$VERSION"
  docker push "agent-ops/agent:latest"
  echo -e "${GREEN}✓ Image pushed to registry${NC}"
fi

echo ""
echo -e "${GREEN}Build complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Test the image:"
echo "     docker run --rm agent-ops/agent:latest node -v"
echo ""
echo "  2. Run with docker-compose:"
echo "     docker-compose -f docker-compose.agent.yml up"
echo ""
echo "  3. Use in production:"
echo "     export TASK_ID=<task-id>"
echo "     export WORKSPACE_PATH=/path/to/workspace"
echo "     export LLM_MODEL=<model-name>"
echo "     docker-compose -f docker-compose.agent.yml up"
