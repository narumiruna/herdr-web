# Show available commands.
default:
    @just --list

# Install dependencies.
install:
    npm install

# Install the herdeer command from this checkout.
install-cli: install
    npm link

# Start the live Vite workbench and Herdeer bridge on available ports.
run:
    #!/bin/sh
    set -eu
    token="${HERDEER_TOKEN:-$(node scripts/access-token.mjs)}"
    web_port="${VITE_PORT:-$(node scripts/find-port.mjs 5173)}"
    bridge_port="${BRIDGE_PORT:-$(node scripts/find-port.mjs 8787)}"
    host=$(node scripts/lan-address.mjs)
    echo "Herdeer token: $token"
    echo "local:   http://localhost:$web_port/?token=$token"
    echo "network: http://$host:$web_port/?token=$token"
    HERDEER_TOKEN="$token" VITE_PORT="$web_port" BRIDGE_PORT="$bridge_port" npm run dev

# Build the production application.
build:
    npm run build

# Preview the production bridge locally.
preview: build
    #!/bin/sh
    set -eu
    token="${HERDEER_TOKEN:-$(node scripts/access-token.mjs)}"
    port="${PORT:-$(node scripts/find-port.mjs 8787)}"
    echo "Herdeer: http://localhost:$port/?token=$token"
    HERDEER_TOKEN="$token" PORT="$port" npm start

# Build and start the production container on an available port.
up:
    #!/bin/sh
    set -eu
    runtime_dir=.herdeer-runtime
    mkdir -p "$runtime_dir"
    if [ -f "$runtime_dir/socket-proxy.pid" ]; then
        old_pid=$(cat "$runtime_dir/socket-proxy.pid")
        case "$(ps -p "$old_pid" -o command= 2>/dev/null || true)" in
            *scripts/socket-proxy.mjs*) kill "$old_pid" 2>/dev/null || true ;;
        esac
        rm -f "$runtime_dir/socket-proxy.pid"
    fi
    export HERDEER_TOKEN="${HERDEER_TOKEN:-$(node scripts/access-token.mjs)}"
    export HERDR_PROJECTS_ROOT="${HERDR_PROJECTS_ROOT:-$HOME}"
    export HERDEER_HOST_UID="${HERDEER_HOST_UID:-$(id -u)}"
    export HERDEER_HOST_GID="${HERDEER_HOST_GID:-$(id -g)}"
    test -d "$HERDR_PROJECTS_ROOT" || { echo "project root not found: $HERDR_PROJECTS_ROOT" >&2; exit 1; }
    socket_path="${HERDR_HOST_SOCKET_PATH:-${HERDR_SOCKET_PATH:-$HOME/.config/herdr/herdr.sock}}"
    test -S "$socket_path" || { echo "herdr socket not found: $socket_path" >&2; exit 1; }
    export HERDR_TCP_PORT="${HERDR_TCP_PORT:-$(node scripts/find-port.mjs 18787)}"
    nohup node scripts/socket-proxy.mjs "$socket_path" "$HERDR_TCP_PORT" >"$runtime_dir/socket-proxy.log" 2>&1 &
    proxy_pid=$!
    echo "$proxy_pid" >"$runtime_dir/socket-proxy.pid"
    keep_proxy=0
    cleanup() {
        if [ "$keep_proxy" = 0 ]; then
            kill "$proxy_pid" 2>/dev/null || true
            rm -f "$runtime_dir/socket-proxy.pid"
        fi
    }
    trap cleanup EXIT INT TERM
    sleep 0.2
    kill -0 "$proxy_pid"
    docker compose up --build --detach --remove-orphans
    port=$(docker compose port herdeer 8080 | head -n 1 | sed 's/.*://')
    host=$(node scripts/lan-address.mjs)
    keep_proxy=1
    echo "local:   http://localhost:$port/?token=$HERDEER_TOKEN"
    echo "network: http://$host:$port/?token=$HERDEER_TOKEN"

# Stop the production container and host socket proxy.
down:
    #!/bin/sh
    set -eu
    docker compose down
    pid_file=.herdeer-runtime/socket-proxy.pid
    if [ -f "$pid_file" ]; then
        proxy_pid=$(cat "$pid_file")
        case "$(ps -p "$proxy_pid" -o command= 2>/dev/null || true)" in
            *scripts/socket-proxy.mjs*) kill "$proxy_pid" 2>/dev/null || true ;;
        esac
        rm -f "$pid_file"
    fi
    rm -f .herdeer-runtime/socket-proxy.log
    rmdir .herdeer-runtime 2>/dev/null || true

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
