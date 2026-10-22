#!/bin/sh
set -eu

# Docker commands use the repository Compose file and checkout runtime state.
cd "$(dirname "$0")/../../.."

data_home="${HERDR_WEB_HOME:-$HOME/.herdr-web}"
case "$data_home" in /*) ;; *) echo "HERDR_WEB_HOME must be absolute: $data_home" >&2; exit 1 ;; esac
runtime_dir="$data_home/runtime"
checkout_runtime_dir=.herdr-web-runtime
active_data_home_file="$checkout_runtime_dir/data-home"
legacy_runtime_dir=.he"dr"-runtime

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

stop_runtime_dir() {
    runtime_path="$1"
    stop_proxy "$runtime_path/socket-proxy.pid" "scripts/socket-proxy.mjs"
    stop_proxy "$runtime_path/terminal-proxy.pid" "scripts/terminal-session-proxy.mjs"
}

stop_proxies() {
    stop_runtime_dir "$runtime_dir"
    if [ -f "$active_data_home_file" ]; then
        saved_data_home=$(sed -n '1p' "$active_data_home_file")
        case "$saved_data_home" in /*) stop_runtime_dir "$saved_data_home/runtime" ;; esac
    fi
    stop_runtime_dir "$checkout_runtime_dir"
    stop_runtime_dir "$legacy_runtime_dir"
}

clean_runtime_dir() {
    runtime_path="$1"
    rm -f "$runtime_path/socket-proxy.log" "$runtime_path/terminal-proxy.log"
    rmdir "$runtime_path" 2>/dev/null || true
}

up() {
    mkdir -p "$runtime_dir"
    chmod 700 "$data_home" "$runtime_dir"
    stop_proxies
    mkdir -p "$checkout_runtime_dir"
    printf '%s\n' "$data_home" >"$active_data_home_file"
    export HERDR_WEB_HOME="$data_home"
    export HERDR_WEB_TOKEN="${HERDR_WEB_TOKEN:-$(node apps/web/scripts/access-token.mjs)}"
    export HERDR_TERMINAL_PROXY_TOKEN="${HERDR_TERMINAL_PROXY_TOKEN:-$(node apps/web/scripts/access-token.mjs)}"
    export HERDR_PROJECTS_ROOT="${HERDR_PROJECTS_ROOT:-$HOME}"
    export HERDR_WEB_HOST_UID="${HERDR_WEB_HOST_UID:-$(id -u)}"
    export HERDR_WEB_HOST_GID="${HERDR_WEB_HOST_GID:-$(id -g)}"
    if [ -z "${HERDR_TERMINAL_CLIENT_PROTOCOL:-}" ]; then
        herdr_command="${HERDR_BINARY:-${HERDR_BIN_PATH:-herdr}}"
        protocol=$("$herdr_command" status --json | node -e 'let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { input += chunk; }); process.stdin.on("end", () => { const protocol = JSON.parse(input)?.client?.protocol; if (!Number.isInteger(protocol) || protocol < 1) process.exit(1); process.stdout.write(String(protocol)); });')
        export HERDR_TERMINAL_CLIENT_PROTOCOL="$protocol"
    fi
    test -d "$HERDR_PROJECTS_ROOT" || { echo "project root not found: $HERDR_PROJECTS_ROOT" >&2; exit 1; }
    socket_path="${HERDR_HOST_SOCKET_PATH:-${HERDR_SOCKET_PATH:-$HOME/.config/herdr/herdr.sock}}"
    test -S "$socket_path" || { echo "herdr socket not found: $socket_path" >&2; exit 1; }
    export HERDR_TCP_PORT="${HERDR_TCP_PORT:-$(node apps/web/scripts/find-port.mjs 18787)}"
    export HERDR_TERMINAL_PROXY_PORT="${HERDR_TERMINAL_PROXY_PORT:-$(node apps/web/scripts/find-port.mjs 18788)}"
    nohup node apps/web/scripts/socket-proxy.mjs "$socket_path" "$HERDR_TCP_PORT" >"$runtime_dir/socket-proxy.log" 2>&1 &
    socket_proxy_pid=$!
    echo "$socket_proxy_pid" >"$runtime_dir/socket-proxy.pid"
    nohup node apps/web/scripts/terminal-session-proxy.mjs "$HERDR_TERMINAL_PROXY_PORT" >"$runtime_dir/terminal-proxy.log" 2>&1 &
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
    host=$(node apps/web/scripts/lan-address.mjs)
    keep_proxies=1
    echo "local:   http://localhost:$port/?token=$HERDR_WEB_TOKEN"
    echo "network: http://$host:$port/?token=$HERDR_WEB_TOKEN"
}

down() {
    docker compose down
    stop_proxies
    clean_runtime_dir "$runtime_dir"
    if [ -f "$active_data_home_file" ]; then
        saved_data_home=$(sed -n '1p' "$active_data_home_file")
        case "$saved_data_home" in /*) clean_runtime_dir "$saved_data_home/runtime" ;; esac
    fi
    rm -f "$checkout_runtime_dir/socket-proxy.log" "$checkout_runtime_dir/terminal-proxy.log" "$active_data_home_file"
    clean_runtime_dir "$checkout_runtime_dir"
    clean_runtime_dir "$legacy_runtime_dir"
}

case "${1:-}" in
    up) up ;;
    down) down ;;
    *) echo "Usage: sh apps/web/scripts/docker.sh up|down" >&2; exit 1 ;;
esac
