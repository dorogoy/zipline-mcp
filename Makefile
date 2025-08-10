.PHONY: install build start dev test format format-check clean publish

# Default target
all: install build format-check test

# Install dependencies
install:
	npm install

# Build the project
build: clean
	npm run build

# Start the server
start:
	npm run start

# Run in development mode
dev:
	npm run dev

# Run tests
test: lint
	npm run test:run

# Format the code
format:
	npm run format

# Check code formatting
format-check:
	npm run format:check

# Clean build artifacts
clean:
	rm -rf dist/

# Lint the code
lint:
	npm run lint

# Publish to npm
publish: clean build format-check test
	npm publish
