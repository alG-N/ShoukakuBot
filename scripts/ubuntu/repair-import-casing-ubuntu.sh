#!/usr/bin/env bash
set -euo pipefail

# ==============================================================
# Shoukaku - Repair Import Path Casing (Linux)
#
# What this does:
#   1. Scans src/**/*.ts for relative .js imports
#   2. Compares each import path to the real file casing on disk
#   3. Uses git mv to repair case-only filename drift
#
# Usage:
#   bash scripts/ubuntu/repair-import-casing-ubuntu.sh
#
# Notes:
#   - Uses local node when available
#   - Falls back to dockerized node via $NPM_UPDATE_IMAGE when node is absent
# ==============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

setup_error_trap
cd "$ROOT_DIR"

echo "====================================================="
echo "  Shoukaku - Repair Import Path Casing (Linux)"
echo "====================================================="

require_cmd git
require_files package.json tsconfig.json

emit_case_mismatch_pairs() {
  local detector
  detector="$(cat <<'NODE'
const fs = require("fs");
const path = require("path");

function walk(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const nextPath = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(nextPath));
      continue;
    }

    if (entry.isFile() && nextPath.endsWith(".ts")) {
      files.push(nextPath);
    }
  }

  return files;
}

const rootDir = "src";
if (!fs.existsSync(rootDir)) {
  process.exit(0);
}

const files = walk(rootDir).sort();
const actualMap = new Map(files.map((file) => [file.toLowerCase(), file]));
const importRegex = /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const renameMap = new Map();

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");

  for (const match of text.matchAll(importRegex)) {
    const specifier = match[1] || match[2] || match[3];
    if (!specifier || !specifier.startsWith(".")) {
      continue;
    }

    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), specifier.replace(/\.js$/, ".ts"))
    );
    const actual = actualMap.get(resolved.toLowerCase());

    if (!actual || actual === resolved) {
      continue;
    }

    renameMap.set(actual, resolved);
  }
}

for (const [actual, target] of [...renameMap.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
  process.stdout.write(actual + "\t" + target + "\n");
}
NODE
)"

  if command -v node >/dev/null 2>&1; then
    node -e "$detector"
    return 0
  fi

  require_cmd docker
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon is not running, and node is not installed locally." >&2
    exit 1
  fi

  docker run --rm -i \
    -v "$ROOT_DIR:/workspace" \
    -w /workspace \
    "$NPM_UPDATE_IMAGE" \
    node -e "$detector"
}

print_case_mismatch_pairs() {
  local pairs="$1"

  while IFS=$'\t' read -r source target; do
    if [[ -z "$source" || -z "$target" ]]; then
      continue
    fi
    log_info "$source -> $target"
  done <<< "$pairs"
}

APPLIED_REPAIR_COUNT=0
apply_case_repairs() {
  local pairs="$1"

  while IFS=$'\t' read -r source target; do
    if [[ -z "$source" || -z "$target" ]]; then
      continue
    fi

    if [[ ! -e "$source" ]]; then
      echo "ERROR: Source path does not exist: $source" >&2
      exit 1
    fi

    if [[ -e "$target" ]]; then
      echo "ERROR: Target path already exists: $target" >&2
      exit 1
    fi

    if ! git ls-files --error-unmatch "$source" >/dev/null 2>&1; then
      echo "ERROR: Git does not track source path: $source" >&2
      exit 1
    fi

    local target_dir
    local target_name
    local temp_path
    target_dir="$(dirname "$target")"
    target_name="$(basename "$target")"
    temp_path="$target_dir/.casefix.$$.$RANDOM.$target_name"

    if [[ -e "$temp_path" ]]; then
      echo "ERROR: Temporary path already exists: $temp_path" >&2
      exit 1
    fi

    git mv -f "$source" "$temp_path"
    git mv -f "$temp_path" "$target"
    log_ok "$source -> $target"
    APPLIED_REPAIR_COUNT=$((APPLIED_REPAIR_COUNT + 1))
  done <<< "$pairs"
}

log_section "[1/3] Scanning repository for case-only path drift..."
case_pairs="$(emit_case_mismatch_pairs)"

if [[ -z "$case_pairs" ]]; then
  log_ok "No import/file casing repairs are needed"
  exit 0
fi

log_warn "Detected case-only path drift:"
print_case_mismatch_pairs "$case_pairs"

log_section "[2/3] Applying git case renames..."
apply_case_repairs "$case_pairs"

log_section "[3/3] Verifying repairs..."
remaining_pairs="$(emit_case_mismatch_pairs)"
if [[ -n "$remaining_pairs" ]]; then
  echo "ERROR: Some casing mismatches remain after repair:" >&2
  print_case_mismatch_pairs "$remaining_pairs" >&2
  exit 1
fi

log_ok "Normalized $APPLIED_REPAIR_COUNT tracked path(s) to match import casing"
echo
echo "Next step: bash scripts/ubuntu/update-ubuntu.sh"