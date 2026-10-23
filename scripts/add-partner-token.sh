#!/usr/bin/env bash
#
# Issues a private dashboard link for a partner.
#
# Does the three steps from PARTNER_LINKS.md in one go:
#   1. generates a token with `openssl rand -hex 8`
#   2. adds it to the PARTNER_TOKENS env var in Netlify
#   3. appends the row to PARTNER_LINKS.md
#
# The token is the credential, so it is never printed to the screen — it
# goes into Netlify and into PARTNER_LINKS.md, and nowhere else.
#
# Usage:
#   ./scripts/add-partner-token.sh <slug> "<Display Name>"
#
# Example:
#   ./scripts/add-partner-token.sh marketman "MarketMan"
#
# Use the CANONICAL slug — the first entry in the partner's alias group in
# src/lib/airtable.ts, which is also the one in the internal page's URL
# (/partners/<slug>). Getting this wrong gives the partner an empty dashboard.
#
# After this runs, Netlify needs a redeploy before the link works.

set -euo pipefail

SLUG="${1:-}"
NAME="${2:-}"

if [ -z "$SLUG" ] || [ -z "$NAME" ]; then
  echo "Usage: ./scripts/add-partner-token.sh <slug> \"<Display Name>\"" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if ! netlify status >/dev/null 2>&1; then
  echo "Not logged in to Netlify. Run: netlify login" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

openssl rand -hex 8 > "$TMP/tok"
netlify env:get PARTNER_TOKENS > "$TMP/cur" 2>/dev/null

SLUG="$SLUG" python3 - "$TMP" <<'PY'
import json, os, pathlib, sys

tmp = pathlib.Path(sys.argv[1])
slug = os.environ["SLUG"]
token = tmp.joinpath("tok").read_text().strip()
raw = tmp.joinpath("cur").read_text().strip()

try:
    current = json.loads(raw)
except Exception:
    # Never overwrite the map with a guess — a bad write here breaks every
    # partner's link at once.
    print("Could not read the existing PARTNER_TOKENS as JSON. Nothing changed.", file=sys.stderr)
    sys.exit(1)

if not isinstance(current, dict) or not current:
    print("PARTNER_TOKENS came back empty. Nothing changed.", file=sys.stderr)
    sys.exit(1)

if slug in current.values():
    print(f'"{slug}" already has a token. Nothing changed.', file=sys.stderr)
    sys.exit(1)

before = len(current)
current[token] = slug
tmp.joinpath("new").write_text(json.dumps(current))
tmp.joinpath("tok").write_text(token)
print(f"{before} tokens -> {len(current)}")
PY

# Netlify's output is left visible on purpose. Hiding it once turned a
# hang into a blank screen with no way to tell whether the CLI was slow,
# asking a question, or dead.
echo "Writing to Netlify (this can take a few seconds)..."
# --force skips the "this variable already exists, overwrite?" prompt.
# Overwriting is always correct here: the value written is the existing map
# read back moments earlier, plus one new entry. The python step above
# refuses to proceed if that read returned anything unparseable or empty,
# so there is no path where --force clobbers a map we did not just read.
netlify env:set PARTNER_TOKENS "$(cat "$TMP/new")" --force
echo "Netlify: PARTNER_TOKENS updated"

printf '| %s | `%s` | https://partners.wearestacked.io/p/%s |\n' \
  "$NAME" "$SLUG" "$(cat "$TMP/tok")" >> PARTNER_LINKS.md
echo "PARTNER_LINKS.md: row added for $NAME"

echo
echo "Now redeploy so the new token is live:"
echo "  netlify deploy --build --prod"
echo
echo "Then the 'View as partner' button appears on /partners/$SLUG,"
echo "and the link itself is the last row of PARTNER_LINKS.md."
