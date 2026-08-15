# Show available commands.
default:
    @just --list

# Install dependencies.
install:
    npm install

# Install the herdr-web command from this checkout.
install-cli: install
    npm link

# Start the live Vite workbench and herdr-web bridge on available ports.
run:
    #!/bin/sh
    set -eu
    token="${HERDR_WEB_TOKEN:-$(node scripts/access-token.mjs)}"
    web_port="${VITE_PORT:-$(node scripts/find-port.mjs 5173)}"
    bridge_port="${BRIDGE_PORT:-$(node scripts/find-port.mjs 8787)}"
    host=$(node scripts/lan-address.mjs)
    echo "herdr-web token: $token"
    echo "local:   http://localhost:$web_port/?token=$token"
    echo "network: http://$host:$web_port/?token=$token"
    HERDR_WEB_TOKEN="$token" VITE_PORT="$web_port" BRIDGE_PORT="$bridge_port" npm run dev

# Build the production application.
build:
    npm run build

# Preview the production bridge locally.
preview: build
    #!/bin/sh
    set -eu
    token="${HERDR_WEB_TOKEN:-$(node scripts/access-token.mjs)}"
    port="${PORT:-$(node scripts/find-port.mjs 8787)}"
    echo "herdr-web: http://localhost:$port/?token=$token"
    HERDR_WEB_TOKEN="$token" PORT="$port" npm start

# Build and start the production container on an available port.
up:
    #!/bin/sh
    set -eu
    runtime_dir=.herdr-web-runtime
    legacy_runtime_dir=.he"dr"-runtime
    mkdir -p "$runtime_dir"
    stop_proxy() {
        pid_file="$1"
        pattern="$2"
        if [ -f "$pid_file" ]; then
            old_pid=$(cat "$pid_file")
            case "$(ps -p "$old_pid" -o command= 2>/dev/null || true)" in
                *"$pattern"*) kill "$old_pid" 2>/dev/null || true ;;
            esac
            rm -f "$pid_file"
        fi
    }
    stop_proxy "$runtime_dir/socket-proxy.pid" "scripts/socket-proxy.mjs"
    stop_proxy "$runtime_dir/terminal-proxy.pid" "scripts/terminal-session-proxy.mjs"
    stop_proxy "$legacy_runtime_dir/socket-proxy.pid" "scripts/socket-proxy.mjs"
    stop_proxy "$legacy_runtime_dir/terminal-proxy.pid" "scripts/terminal-session-proxy.mjs"
    export HERDR_WEB_TOKEN="${HERDR_WEB_TOKEN:-$(node scripts/access-token.mjs)}"
    export HERDR_TERMINAL_PROXY_TOKEN="${HERDR_TERMINAL_PROXY_TOKEN:-$(node scripts/access-token.mjs)}"
    export HERDR_PROJECTS_ROOT="${HERDR_PROJECTS_ROOT:-$HOME}"
    export HERDR_WEB_HOST_UID="${HERDR_WEB_HOST_UID:-$(id -u)}"
    export HERDR_WEB_HOST_GID="${HERDR_WEB_HOST_GID:-$(id -g)}"
    test -d "$HERDR_PROJECTS_ROOT" || { echo "project root not found: $HERDR_PROJECTS_ROOT" >&2; exit 1; }
    socket_path="${HERDR_HOST_SOCKET_PATH:-${HERDR_SOCKET_PATH:-$HOME/.config/herdr/herdr.sock}}"
    test -S "$socket_path" || { echo "herdr socket not found: $socket_path" >&2; exit 1; }
    export HERDR_TCP_PORT="${HERDR_TCP_PORT:-$(node scripts/find-port.mjs 18787)}"
    export HERDR_TERMINAL_PROXY_PORT="${HERDR_TERMINAL_PROXY_PORT:-$(node scripts/find-port.mjs 18788)}"
    nohup node scripts/socket-proxy.mjs "$socket_path" "$HERDR_TCP_PORT" >"$runtime_dir/socket-proxy.log" 2>&1 &
    socket_proxy_pid=$!
    echo "$socket_proxy_pid" >"$runtime_dir/socket-proxy.pid"
    nohup node scripts/terminal-session-proxy.mjs "$HERDR_TERMINAL_PROXY_PORT" >"$runtime_dir/terminal-proxy.log" 2>&1 &
    terminal_proxy_pid=$!
    echo "$terminal_proxy_pid" >"$runtime_dir/terminal-proxy.pid"
    keep_proxies=0
    cleanup() {
        if [ "$keep_proxies" = 0 ]; then
            kill "$socket_proxy_pid" "$terminal_proxy_pid" 2>/dev/null || true
            rm -f "$runtime_dir/socket-proxy.pid" "$runtime_dir/terminal-proxy.pid"
        fi
    }
    trap cleanup EXIT INT TERM
    sleep 0.2
    kill -0 "$socket_proxy_pid"
    kill -0 "$terminal_proxy_pid"
    docker compose up --build --detach --remove-orphans
    port=$(docker compose port herdr-web 8080 | head -n 1 | sed 's/.*://')
    host=$(node scripts/lan-address.mjs)
    keep_proxies=1
    echo "local:   http://localhost:$port/?token=$HERDR_WEB_TOKEN"
    echo "network: http://$host:$port/?token=$HERDR_WEB_TOKEN"

# Stop the production container and host socket proxies.
down:
    #!/bin/sh
    set -eu
    docker compose down
    stop_proxy() {
        pid_file="$1"
        pattern="$2"
        if [ -f "$pid_file" ]; then
            proxy_pid=$(cat "$pid_file")
            case "$(ps -p "$proxy_pid" -o command= 2>/dev/null || true)" in
                *"$pattern"*) kill "$proxy_pid" 2>/dev/null || true ;;
            esac
            rm -f "$pid_file"
        fi
    }
    legacy_runtime_dir=.he"dr"-runtime
    stop_proxy .herdr-web-runtime/socket-proxy.pid "scripts/socket-proxy.mjs"
    stop_proxy .herdr-web-runtime/terminal-proxy.pid "scripts/terminal-session-proxy.mjs"
    stop_proxy "$legacy_runtime_dir/socket-proxy.pid" "scripts/socket-proxy.mjs"
    stop_proxy "$legacy_runtime_dir/terminal-proxy.pid" "scripts/terminal-session-proxy.mjs"
    rm -f .herdr-web-runtime/socket-proxy.log .herdr-web-runtime/terminal-proxy.log
    rm -f "$legacy_runtime_dir/socket-proxy.log" "$legacy_runtime_dir/terminal-proxy.log"
    rmdir .herdr-web-runtime "$legacy_runtime_dir" 2>/dev/null || true

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
