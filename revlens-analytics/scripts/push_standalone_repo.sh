#!/usr/bin/env bash
# =============================================================================
# Optional Helper: Publish `revlens-analytics/` as its own standalone GitHub repo
# Usage (from your local terminal with `gh` authenticated):
#   bash scripts/push_standalone_repo.sh revlens-saas-analytics
# =============================================================================
set -euo pipefail

REPO_NAME="${1:-revlens-saas-analytics}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"

echo "Packaging standalone repository into ${TMP_DIR}..."
rsync -a \
  --exclude 'node_modules' \
  --exclude 'dashboard/dist' \
  --exclude 'warehouse/*.db' \
  --exclude '.pytest_cache' \
  --exclude '.ruff_cache' \
  --exclude '__pycache__' \
  "${PROJECT_DIR}/" "${TMP_DIR}/"

cd "${TMP_DIR}"
git init -b main
git add .
git commit -m "feat: RevLens B2B SaaS Revenue, Retention & Decision Science Analytics"
gh repo create "${REPO_NAME}" --public --source=. --remote=origin --push

echo "Successfully published standalone repository: https://github.com/$(gh api user -q .login)/${REPO_NAME}"
