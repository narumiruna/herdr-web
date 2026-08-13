# Show available commands.
default:
    @just --list

# Install dependencies.
install:
    npm install

# Start the Vite development server.
run:
    npm run dev

# Build the production application.
build:
    npm run build

# Preview the production build.
preview: build
    npm run preview

# Build and start the production container on an available port.
up:
    docker compose up --build --detach
    @port=$(docker compose port web 80 | head -n 1 | sed 's/.*://'); echo "herdr web: http://localhost:$port"

# Stop and remove the production container.
down:
    docker compose down

# Run reducer and component tests once.
test:
    npm test

# Run desktop and mobile browser checks.
e2e:
    npm run test:e2e

# Check formatting and lint rules.
check:
    npm run check

# Apply Biome formatting and safe lint fixes.
fix:
    npm exec -- biome check --write .

# Run the same checks used by CI and the pre-commit hook.
ci:
    npm run ci
