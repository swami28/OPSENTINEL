.PHONY: up down build logs test lint dev-backend dev-frontend

up:
	docker compose up -d --build

down:
	docker compose down -v

build:
	docker compose build

logs:
	docker compose logs -f

test:
	cd backend && pytest -v --cov=app
	cd frontend && npm test

lint:
	cd backend && ruff check app tests
	cd frontend && npm run typecheck

dev-backend:
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

dev-frontend:
	cd frontend && npm run dev
