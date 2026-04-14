.PHONY: install dev build start test lint typecheck verify migrate seed clean setup help

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# Setup & Install
install: ## Install dependencies
	npm install
	npx prisma generate

setup: install ## Full setup: install + migrate + seed
	npx prisma migrate deploy
	npm run seed:dev
	@echo "\n✅ Setup complete. Run 'make dev' to start."

# Development
dev: ## Start dev server
	npm run dev

build: ## Production build
	npm run build

start: ## Start production server
	npm run start

# Database
migrate: ## Run database migrations
	npx prisma migrate deploy

migrate-dev: ## Create new migration (dev only)
	npx prisma migrate dev

seed: ## Seed database (dev)
	npm run seed:dev

seed-prod: ## Seed database (production)
	npm run seed:prod

generate: ## Regenerate Prisma client
	npx prisma generate

# Quality
lint: ## Run ESLint
	npm run lint

typecheck: ## Run TypeScript type check
	npm run typecheck

test: ## Run tests (watch mode)
	npm run test

test-run: ## Run tests once
	npm run test:run

test-e2e: ## Run end-to-end tests
	npm run test:e2e

verify: ## Full verification: lint + typecheck + test + build
	npm run verify

# Docker
docker-up: ## Start all services with Docker Compose
	docker compose up -d

docker-down: ## Stop all services
	docker compose down

docker-build: ## Build Docker image
	docker compose build

docker-logs: ## Tail Docker logs
	docker compose logs -f

# Cleanup
clean: ## Remove node_modules, build artifacts, generated files
	rm -rf node_modules .next out
	@echo "✅ Cleaned. Run 'make install' to reinstall."
