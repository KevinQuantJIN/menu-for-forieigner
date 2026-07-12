#!/usr/bin/env bash
set -euo pipefail

action="${1:-deploy}"
if [[ "$action" != "deploy" && "$action" != "preview" ]]; then
  echo "Usage: $0 [deploy|preview]" >&2
  exit 2
fi

project_root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$project_root/.env.local"
env_backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/menulens-env-local.XXXXXX")"
env_backup="$env_backup_dir/.env.local"

restore_env() {
  if [[ -f "$env_backup" ]]; then
    mv "$env_backup" "$env_file"
  fi
  rmdir "$env_backup_dir" 2>/dev/null || true
}
trap restore_env EXIT INT TERM

# Next.js inlines values from .env.local during its production build. Cloudflare
# credentials are runtime secrets, so keep the local file outside the build tree.
if [[ -f "$env_file" ]]; then
  mv "$env_file" "$env_backup"
fi

cd "$project_root"
npx opennextjs-cloudflare build
npx opennextjs-cloudflare "$action"
