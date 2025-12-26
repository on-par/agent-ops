# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Agent Docker Image (ARM64)
# Base: node:20-slim for ARM64 compatibility and glibc support

# Stage 1: Base dependencies
FROM node:20-slim AS base

# Install git and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: Builder - TypeScript compilation and dependencies
FROM base AS builder

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install all dependencies (including dev for TypeScript compilation)
RUN npm ci

# Copy source code
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Install global CLI tools - beads CLI
RUN npm install -g @beadsorg/bd

# Stage 3: Production runtime
FROM base AS production

WORKDIR /workspace

# Create non-root user (node user already exists in node:20-slim, UID 1000)
# Verify node user exists and create if needed
RUN id -u node 2>/dev/null || useradd -m -u 1000 node

# Copy built application from builder
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package*.json /app/

# Copy global CLI tools
COPY --from=builder /usr/local/lib/node_modules/@beadsorg /usr/local/lib/node_modules/@beadsorg
COPY --from=builder /usr/local/bin/bd /usr/local/bin/bd

# Copy entrypoint script
COPY backend/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && \
    chown node:node /usr/local/bin/entrypoint.sh

# Set up workspace directory with proper permissions
RUN mkdir -p /workspace && chown -R node:node /workspace

# Switch to non-root user
USER node

# Set environment
ENV NODE_ENV=production
ENV PATH=/usr/local/bin:$PATH

# Volume mounts for workspace and beads
VOLUME ["/workspace"]

# Entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default command - can be overridden
CMD ["node", "/app/dist/agent-entrypoint.js"]
