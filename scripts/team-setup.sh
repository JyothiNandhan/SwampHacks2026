#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo 'Install Node 22.16.0 first (nvm install / nvm use)'; exit 1; }
node scripts/check-versions.mjs
if ! command -v pnpm >/dev/null; then
  echo 'pnpm missing: install pnpm 9.15.9 (corepack or npm install -g pnpm@9.15.9)'; exit 1
fi
pnpm --version | grep -qx '9.15.9' || { echo 'Expected pnpm 9.15.9'; exit 1; }
if [[ ! -f pnpm-lock.yaml ]]; then
 echo 'LOCKFILE MISSING: Rishav must run pnpm install on an internet-connected machine, validate, and commit pnpm-lock.yaml before teammates run setup.'; exit 1
fi
pnpm install --frozen-lockfile
pnpm check
printf '\nREADY: pinned install + checks passed.\n'
