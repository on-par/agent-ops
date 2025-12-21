.PHONY: install run stop logs clean db-push db-reset

# Install dependencies in both frontend and backend
install:
	cd backend && npm ci
	cd frontend && npm ci

# Run both frontend and backend in background
run:
	@echo "Starting backend..."
	@cd backend && npm run dev > /tmp/agent-ops-backend.log 2>&1 & echo $$! > /tmp/agent-ops-backend.pid
	@echo "Starting frontend..."
	@cd frontend && npm run dev > /tmp/agent-ops-frontend.log 2>&1 & echo $$! > /tmp/agent-ops-frontend.pid
	@echo "Backend PID: $$(cat /tmp/agent-ops-backend.pid)"
	@echo "Frontend PID: $$(cat /tmp/agent-ops-frontend.pid)"
	@echo "Logs: /tmp/agent-ops-{backend,frontend}.log"

# Stop running processes
stop:
	@echo "Stopping agent-ops processes..."
	@pkill -f "agent-ops/(frontend|backend)/node_modules" 2>/dev/null || true
	@rm -f /tmp/agent-ops-backend.pid /tmp/agent-ops-frontend.pid
	@echo "All agent-ops processes stopped"

# Tail logs from both processes
logs:
	@tail -f /tmp/agent-ops-backend.log /tmp/agent-ops-frontend.log

# Remove node_modules and build artifacts
clean:
	rm -rf backend/node_modules backend/dist
	rm -rf frontend/node_modules frontend/dist

# Push Drizzle schema to SQLite database
db-push:
	cd backend && npx drizzle-kit push

# Reset database (deletes SQLite file)
db-reset:
	rm -f backend/agent-ops.db
	@echo "Database reset. Run 'make db-push' to recreate schema."
