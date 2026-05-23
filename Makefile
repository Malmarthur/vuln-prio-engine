TEST_DB_URL ?= postgresql+asyncpg://vulnprio:vulnprio_dev@db:5432/vulnprio_test

# Run all tests inside the backend container
test:
	docker compose exec -e TEST_DATABASE_URL=$(TEST_DB_URL) backend \
		python -m pytest tests/ $(ARGS)

# Unit tests only — no DB required
test-unit:
	docker compose exec -e TEST_DATABASE_URL=$(TEST_DB_URL) backend \
		python -m pytest tests/unit/ $(ARGS)

# Integration tests only
test-integration:
	docker compose exec -e TEST_DATABASE_URL=$(TEST_DB_URL) backend \
		python -m pytest tests/integration/ $(ARGS)

# API tests only
test-api:
	docker compose exec -e TEST_DATABASE_URL=$(TEST_DB_URL) backend \
		python -m pytest tests/api/ $(ARGS)

# All tests with coverage report
test-cov:
	docker compose exec -e TEST_DATABASE_URL=$(TEST_DB_URL) backend \
		python -m pytest tests/ --cov=app --cov-report=term-missing $(ARGS)

# Create the test DB (run once)
test-db-create:
	docker compose exec db psql -U vulnprio -c "CREATE DATABASE vulnprio_test;" || true

# Drop and recreate the test DB (nuclear reset)
test-db-reset:
	docker compose exec db psql -U vulnprio -c "DROP DATABASE IF EXISTS vulnprio_test;"
	docker compose exec db psql -U vulnprio -c "CREATE DATABASE vulnprio_test;"

.PHONY: test test-unit test-integration test-api test-cov test-db-create test-db-reset
