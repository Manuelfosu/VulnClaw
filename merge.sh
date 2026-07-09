#!/usr/bin/env bash
# Merge the BIGGCLAW console into a clone of the VulnClaw repository.
# Usage: ./merge.sh /path/to/VulnClaw
set -euo pipefail
REPO="${1:-}"
if [ -z "$REPO" ]; then
  echo "Usage: ./merge.sh /path/to/VulnClaw-clone"; exit 1; fi
if [ ! -f "$REPO/pyproject.toml" ]; then
  echo "Error: '$REPO' does not look like the VulnClaw repo (no pyproject.toml)."; exit 1; fi
HERE="$(cd "$(dirname "$0")" && pwd)"
echo "Merging BIGGCLAW console into: $REPO"
cp -R "$HERE/biggclaw" "$REPO/biggclaw"
for f in wsgi.py Procfile render.yaml .env.biggclaw.example; do
  if [ -e "$REPO/$f" ]; then
    cp "$REPO/$f" "$REPO/$f.bak.$(date +%s)"; echo "  backed up existing $f -> $f.bak.*"; fi
  cp "$HERE/$f" "$REPO/$f"
done
echo
echo "Merge complete. Next steps:"
echo "  cd $REPO"
echo "  python -m venv .venv && source .venv/bin/activate"
echo "  pip install -e .                       # installs the VulnClaw engine from this repo"
echo "  pip install -r biggclaw/requirements.txt"
echo "  python biggclaw/set_password.py        # generate ADMIN_PASSWORD_HASH"
echo "  cp .env.biggclaw.example .env          # fill in the values, then export them"
echo "  python wsgi.py                         # open http://localhost:8000"
