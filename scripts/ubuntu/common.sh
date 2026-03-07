#!/usr/bin/env bash
set -euo pipefail

# Shared helpers for Ubuntu scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE="docker compose"
NPM_UPDATE_IMAGE="${NPM_UPDATE_IMAGE:-node:22-alpine}"

on_error() {
  local exit_code="$?"
  local line_no="${1:-unknown}"
  local cmd="${2:-unknown}"
  echo
  echo "ERROR: Command failed (exit=${exit_code}) at line ${line_no}: ${cmd}" >&2
  echo "Hint: check docker status, .env values, and compose logs." >&2
  exit "$exit_code"
}

setup_error_trap() {
  trap 'on_error ${LINENO} "${BASH_COMMAND}"' ERR
}

log_section() {
  echo
  echo "$1"
}

log_ok() {
  echo "  Done - $1"
}

log_warn() {
  echo "  WARNING: $1"
}

log_info() {
  echo "  $1"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: Missing required command: $cmd" >&2
    exit 1
  fi
}

require_files() {
  local missing=0
  for path in "$@"; do
    if [[ ! -f "$ROOT_DIR/$path" ]]; then
      echo "ERROR: Missing file: $path" >&2
      missing=1
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi
}

check_compose_file_valid() {
  local compose_file="$1"
  $COMPOSE -f "$compose_file" config >/dev/null
}

check_docker_ready() {
  log_section "[0] Checking prerequisites..."

  require_cmd docker
  require_cmd curl

  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon is not running." >&2
    exit 1
  fi

  if ! $COMPOSE version >/dev/null 2>&1; then
    echo "ERROR: Docker Compose plugin is not available (docker compose)." >&2
    exit 1
  fi

  require_files \
    docker-compose.yml \
    docker-compose.lavalink.yml \
    docker-compose.cobalt.yml \
    docker-compose.monitoring.yml

  check_compose_file_valid "docker-compose.yml"
  check_compose_file_valid "docker-compose.lavalink.yml"
  check_compose_file_valid "docker-compose.cobalt.yml"
  check_compose_file_valid "docker-compose.monitoring.yml"

  log_ok "Docker daemon, Compose plugin, and compose files are valid"
}

refresh_direct_npm_dependencies() {
  if [[ "${SKIP_NODE_DEP_UPDATES:-0}" == "1" ]]; then
    log_warn "Skipping npm dependency refresh because SKIP_NODE_DEP_UPDATES=1"
    return 0
  fi

  require_files package.json package-lock.json

  local docker_user_args=()
  if command -v id >/dev/null 2>&1; then
    docker_user_args=("-u" "$(id -u):$(id -g)")
  fi

  local prod_raw=""
  local dev_raw=""

  prod_raw="$(docker run --rm -v "$ROOT_DIR:/workspace" -w /workspace "$NPM_UPDATE_IMAGE" node -e "const pkg=require('./package.json'); const deps=Object.keys(pkg.dependencies||{}); process.stdout.write(deps.map((name)=>name + '@latest').join(' '));")"
  dev_raw="$(docker run --rm -v "$ROOT_DIR:/workspace" -w /workspace "$NPM_UPDATE_IMAGE" node -e "const pkg=require('./package.json'); const deps=Object.keys(pkg.devDependencies||{}); process.stdout.write(deps.map((name)=>name + '@latest').join(' '));")"

  local prod_deps=()
  local dev_deps=()

  if [[ -n "$prod_raw" ]]; then
    # shellcheck disable=SC2206
    prod_deps=($prod_raw)
  fi

  if [[ -n "$dev_raw" ]]; then
    # shellcheck disable=SC2206
    dev_deps=($dev_raw)
  fi

  if [[ "${#prod_deps[@]}" -eq 0 && "${#dev_deps[@]}" -eq 0 ]]; then
    log_warn "No direct npm dependencies found to refresh"
    return 0
  fi

  log_info "Refreshing direct npm dependencies using $NPM_UPDATE_IMAGE"

  if [[ "${#prod_deps[@]}" -gt 0 ]]; then
    docker run --rm "${docker_user_args[@]}" -v "$ROOT_DIR:/workspace" -w /workspace "$NPM_UPDATE_IMAGE" npm install --package-lock-only "${prod_deps[@]}"
  fi

  if [[ "${#dev_deps[@]}" -gt 0 ]]; then
    docker run --rm "${docker_user_args[@]}" -v "$ROOT_DIR:/workspace" -w /workspace "$NPM_UPDATE_IMAGE" npm install --package-lock-only -D "${dev_deps[@]}"
  fi

  log_ok "package.json and package-lock.json refreshed to the latest direct dependency versions"
}

validate_env_soft() {
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    log_warn "No .env file found. Bot may fail to start."
    return
  fi

  local missing=()
  grep -Eq '^BOT_TOKEN=.+' "$ROOT_DIR/.env" || missing+=("BOT_TOKEN")
  grep -Eq '^CLIENT_ID=.+' "$ROOT_DIR/.env" || missing+=("CLIENT_ID")

  if [[ "${#missing[@]}" -gt 0 ]]; then
    log_warn "Missing required env vars in .env: ${missing[*]}"
  else
    log_ok ".env contains BOT_TOKEN and CLIENT_ID"
  fi
}

ensure_network() {
  local network_name="$1"
  if ! docker network inspect "$network_name" >/dev/null 2>&1; then
    docker network create "$network_name" >/dev/null
    log_ok "Created network $network_name"
  else
    log_ok "Network $network_name already exists"
  fi
}

wait_http_ok() {
  local url="$1"
  local timeout_seconds="$2"
  local label="$3"

  local waited=0
  while [[ "$waited" -lt "$timeout_seconds" ]]; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      log_ok "$label is reachable"
      return 0
    fi

    sleep 3
    waited=$((waited + 3))
    printf "  Waiting for %s... (%ss/%ss)\r" "$label" "$waited" "$timeout_seconds"
  done

  echo
  log_warn "$label did not become reachable after ${timeout_seconds}s"
  return 1
}

get_env_var_from_dotenv() {
  local key="$1"
  local env_file="$ROOT_DIR/.env"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  local raw
  raw="$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)"
  if [[ -z "$raw" ]]; then
    return 1
  fi

  local value="${raw#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%$'\r'}"
  printf '%s' "$value"
}

wait_lavalink_version_ready() {
  local timeout_seconds="$1"
  local password="${LAVALINK_PASSWORD:-}"

  if [[ -z "$password" ]]; then
    password="$(get_env_var_from_dotenv "LAVALINK_PASSWORD" || true)"
  fi
  if [[ -z "$password" ]]; then
    password="youshallnotpass"
  fi

  local waited=0
  while [[ "$waited" -lt "$timeout_seconds" ]]; do
    # Lavalink /version often requires Authorization header depending on config.
    if curl -fsS --max-time 3 -H "Authorization: ${password}" "http://127.0.0.1:2333/version" >/dev/null 2>&1; then
      log_ok "Lavalink /version is reachable (authorized)"
      return 0
    fi

    # Fallback probe inside container: useful when host networking differs.
    local lavalink_cid
    lavalink_cid="$($COMPOSE -f docker-compose.lavalink.yml ps -q lavalink-1 | head -n 1)"
    if [[ -n "$lavalink_cid" ]]; then
      if docker exec "$lavalink_cid" sh -lc "wget -q -O /dev/null --header='Authorization: ${password}' http://127.0.0.1:2333/version" >/dev/null 2>&1; then
        log_warn "Host probe failed but lavalink-1 is responding internally; continuing"
        return 0
      fi

      local health
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$lavalink_cid" 2>/dev/null || true)"
      if [[ "$health" == "healthy" ]]; then
        log_warn "Host probe failed but lavalink-1 healthcheck is healthy; continuing"
        return 0
      fi
    fi

    sleep 3
    waited=$((waited + 3))
    printf "  Waiting for Lavalink /version... (%ss/%ss)\r" "$waited" "$timeout_seconds"
  done

  echo
  log_warn "Lavalink /version did not become reachable after ${timeout_seconds}s"

  echo
  echo "Lavalink diagnostics:"
  docker ps --filter "name=lavalink" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true

  local sid
  for sid in 1 2 3; do
    local cid
    cid="$($COMPOSE -f docker-compose.lavalink.yml ps -q "lavalink-${sid}" | head -n 1)"
    if [[ -n "$cid" ]]; then
      local state
      local health
      state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)"
      echo "  lavalink-${sid}: state=${state:-unknown}, health=${health:-unknown}"
    else
      echo "  lavalink-${sid}: not created"
    fi
  done

  echo
  echo "Recent lavalink-1 logs:"
  $COMPOSE -f docker-compose.lavalink.yml logs --tail 80 lavalink-1 || true

  return 1
}

wait_stack_running() {
  local compose_file="$1"
  local stack_name="$2"
  local timeout_seconds="$3"

  local services
  services="$($COMPOSE -f "$compose_file" config --services)"
  if [[ -z "$services" ]]; then
    log_warn "$stack_name has no services in $compose_file"
    return 0
  fi

  local waited=0
  while [[ "$waited" -lt "$timeout_seconds" ]]; do
    local all_ready=1
    local service

    while IFS= read -r service; do
      [[ -z "$service" ]] && continue

      local cid
      cid="$($COMPOSE -f "$compose_file" ps -q "$service" | head -n 1)"
      if [[ -z "$cid" ]]; then
        all_ready=0
        continue
      fi

      local running
      running="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || true)"
      if [[ "$running" != "true" ]]; then
        all_ready=0
        continue
      fi

      local health
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)"
      if [[ "$health" != "none" && "$health" != "healthy" ]]; then
        all_ready=0
      fi
    done <<< "$services"

    if [[ "$all_ready" -eq 1 ]]; then
      log_ok "$stack_name containers are running"
      return 0
    fi

    sleep 3
    waited=$((waited + 3))
    printf "  Verifying %s... (%ss/%ss)\r" "$stack_name" "$waited" "$timeout_seconds"
  done

  echo
  log_warn "$stack_name not fully ready after ${timeout_seconds}s"
  return 1
}

wait_stack_removed() {
  local compose_file="$1"
  local stack_name="$2"
  local timeout_seconds="$3"

  local waited=0
  while [[ "$waited" -lt "$timeout_seconds" ]]; do
    local any_left=0
    local ids
    ids="$($COMPOSE -f "$compose_file" ps -q || true)"
    if [[ -n "$ids" ]]; then
      any_left=1
    fi

    if [[ "$any_left" -eq 0 ]]; then
      log_ok "$stack_name removed"
      return 0
    fi

    sleep 2
    waited=$((waited + 2))
    printf "  Waiting %s removal... (%ss/%ss)\r" "$stack_name" "$waited" "$timeout_seconds"
  done

  echo
  log_warn "$stack_name still has containers after ${timeout_seconds}s"
  return 1
}

print_container_summary() {
  echo
  echo "Container status:"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

compose_up_retry() {
  local compose_file="$1"
  shift || true

  local max_attempts="${COMPOSE_RETRY_ATTEMPTS:-3}"
  local retry_delay="${COMPOSE_RETRY_DELAY_SECONDS:-8}"
  local attempt=1

  while true; do
    if $COMPOSE -f "$compose_file" up -d "$@"; then
      return 0
    fi

    if [[ "$attempt" -ge "$max_attempts" ]]; then
      echo "ERROR: docker compose up failed for $compose_file after ${max_attempts} attempts" >&2
      return 1
    fi

    log_warn "Compose up failed for $compose_file (attempt ${attempt}/${max_attempts}), retrying in ${retry_delay}s..."
    sleep "$retry_delay"
    attempt=$((attempt + 1))
  done
}
