# Agent Ops

A full-stack TypeScript application for orchestrating AI coding agents. Agent Ops enables teams to manage, monitor, and scale AI-powered development workflows with a modern dashboard interface.

## Features

- **Agent Orchestration**: Spawn, pause, resume, and terminate AI coding agents
- **Work Item Management**: Kanban-style board for tracking development tasks
- **Container Management**: Provision and manage isolated development containers
- **Real-time Monitoring**: WebSocket-powered live updates and execution logs
- **GitHub Integration**: OAuth authentication and repository synchronization
- **Template System**: Reusable agent configurations for consistent workflows

## Tech Stack

**Backend:**
- Fastify (Node.js web framework)
- TypeScript
- SQLite with Drizzle ORM
- WebSocket for real-time updates

**Frontend:**
- React 19 with TypeScript
- Vite (build tool)
- TanStack Query (data fetching)
- Tailwind CSS (styling)
- xterm.js (terminal emulation)

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/agent-ops.git
cd agent-ops

# Start all services
docker compose up

# Access the application
# Frontend: http://localhost:8080
# Backend API: http://localhost:3000
```

### Local Development

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start development servers (in separate terminals)
cd backend && npm run dev    # API at http://localhost:3001
cd frontend && npm run dev   # UI at http://localhost:5173
```

## Architecture Overview

Agent Ops uses a **Vertical Slice Architecture** where code is organized by feature rather than technical layer. Each feature (containers, workers, templates, etc.) contains its own handlers, services, repositories, and tests.

```
agent-ops/
├── backend/           # Fastify API server
│   └── src/
│       ├── features/  # Feature slices (containers, workers, etc.)
│       └── shared/    # Cross-cutting concerns (db, config)
├── frontend/          # React SPA
│   └── src/
│       ├── components/ # Reusable UI components
│       ├── hooks/      # Custom React hooks
│       └── pages/      # Route pages
└── docs/              # Architecture documentation
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Development

```bash
# Run development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Build for production
npm run build

# Lint code
npm run lint
```

## Testing

The project uses **Vitest** for both backend and frontend testing:

- **Backend**: Unit tests with in-memory SQLite, mocked external dependencies
- **Frontend**: Component tests with React Testing Library, API mocking with MSW
- **Pattern**: AAA (Arrange-Act-Assert) for all tests

```bash
# Run all tests
cd backend && npm test
cd frontend && npm test

# Run with coverage
npm test -- --coverage
```

## License

MIT
