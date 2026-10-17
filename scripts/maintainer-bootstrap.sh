#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/check-versions.mjs
command -v pnpm >/dev/null || { echo 'Install pnpm 9.15.9 first'; exit 1; }
pnpm --version | grep -qx '9.15.9' || exit 1
pnpm install
pnpm check
printf '\nCommit pnpm-lock.yaml and manifests in T01 PR. Teammates then use scripts/team-setup.sh.\n'
