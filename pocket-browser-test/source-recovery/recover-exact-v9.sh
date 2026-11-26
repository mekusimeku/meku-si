#!/usr/bin/env bash
# MEKU Pocket exact v9 source recovery from its ORIGINAL local Git object store.
# Read-only to the source repository. Never falls back to HEAD, v8, or any older commit.
set -euo pipefail
EXPECTED='cdda79046ec97bdcd219fcc2f963a252aeef7ea4'
usage() {
  cat <<'HELP'
Usage: bash recover-exact-v9.sh --repo /path/to/original/Pocket/repo [--out /path/outside/repo]

Run INSIDE the reopened original ChatGPT Work/Sites engineering environment.
The tool NEVER downloads, edits, publishes or deploys the project. It refuses
any checkout that lacks the exact commit cdda79046ec97bdcd219fcc2f963a252aeef7ea4.
If --out is omitted, a fresh private directory is created under /tmp.
HELP
}
repo=''; out=''
while (($#)); do
  case "$1" in
    --repo) if (($#<2)); then usage >&2; exit 2; fi; repo=$2; shift 2;;
    --out) if (($#<2)); then usage >&2; exit 2; fi; out=$2; shift 2;;
    --help|-h) usage; exit 0;;
    *) echo 'ERROR: unexpected argument' >&2; usage >&2; exit 2;;
  esac
done
if [[ -z "$repo" || ! -d "$repo" ]]; then echo 'ERROR: original --repo directory is required' >&2; exit 2; fi
if ! command -v git >/dev/null || ! command -v sha256sum >/dev/null || ! command -v python3 >/dev/null; then
  echo 'ERROR: requires Git, sha256sum and Python 3' >&2; exit 2
fi
if ! root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null); then
  echo 'ERROR: given path is not a Git working tree; source NOT recovered' >&2; exit 3
fi
root=$(cd "$root" && pwd -P)
if [[ $(git -C "$root" cat-file -t "$EXPECTED" 2>/dev/null || true) != commit ]]; then
  echo "NOT FOUND: exact Pocket v9 Git commit $EXPECTED is absent from this workspace." >&2
  echo 'No substitute, no export and no source changes. Reopen the original workspace.' >&2
  exit 4
fi
actual=$(git -C "$root" rev-parse "$EXPECTED^{commit}")
if [[ "$actual" != "$EXPECTED" ]]; then echo 'ERROR: expected commit identity mismatch' >&2; exit 4; fi
tree=$(git -C "$root" rev-parse "$EXPECTED^{tree}")
count=$(git -C "$root" ls-tree -rz --name-only "$EXPECTED" | python3 -c "import sys; print(sys.stdin.buffer.read().count(bytes([0])))")
if [[ "$count" -eq 0 ]]; then echo 'ERROR: exact commit tree has no files' >&2; exit 4; fi
if git -C "$root" ls-tree -r "$EXPECTED" | grep -q '^160000 '; then
  echo 'ERROR: exact commit contains Git submodules that require separate source verification' >&2
  exit 5
fi
created_out=0
cleanup() { 
  local exit_code=$?
  if ((exit_code != 0)) && ((created_out == 1)) && [[ -n "$out" ]]; then rm -rf -- "$out"; fi
}
trap cleanup EXIT
if [[ -n "$out" ]]; then
  # Canonicalize without touching the source; resolves symlinked parent paths.
  out=$(python3 - "$out" <<'PYTHON'
from pathlib import Path
import sys
print(Path(sys.argv[1]).resolve(strict=False))
PYTHON
)
  case "$out/" in "$root/"*) echo 'ERROR: output must be outside the source repository' >&2; exit 5;; esac
  if [[ -e "$out" || -L "$out" ]]; then echo 'ERROR: --out already exists; refusing overwrite' >&2; exit 5; fi
  mkdir -p "$(dirname "$out")"
  mkdir -m 700 "$out"
else
  out=$(mktemp -d "/tmp/pocket-v9-exact.XXXXXXXX")
fi
created_out=1
chmod 700 "$out"
archive="$out/MEKU-Pocket-v9-EXACT-SOURCE.zip"
# Archive the exact immutable commit, never the working tree or mutable HEAD.
git -C "$root" archive --format=zip --output="$archive" "$EXPECTED"
chmod 600 "$archive"
git -C "$root" cat-file -p "$EXPECTED" > "$out/commit-object.txt"
chmod 600 "$out/commit-object.txt"
sha=$(sha256sum "$archive" | cut -d' ' -f1)
cat > "$out/MANIFEST.txt" <<MANIFEST
MEKU Pocket exact-source recovery — local export only
source_commit=$EXPECTED
source_tree=$tree
archive_sha256=$sha
tracked_paths=$count
source_repo=$root
archive_file=MEKU-Pocket-v9-EXACT-SOURCE.zip
SOURCE_PRIVATE=YES
REQUIRE_V9_REVIEW_AND_TESTS=YES
NOT_PRODUCTION_APPROVAL=YES
MANIFEST
chmod 600 "$out/MANIFEST.txt"
python3 - "$archive" "$count" <<'PY'
from pathlib import Path
import sys, zipfile
archive=Path(sys.argv[1]); count=int(sys.argv[2])
with zipfile.ZipFile(archive) as z:
    bad=z.testzip()
    names=z.namelist()
    files=[n for n in names if not n.endswith('/')]
    if bad is not None or len(files)==0 or len(files)!=count:
        raise SystemExit('ERROR: archive extraction integrity / tracked-path count mismatch')
    if any(n.startswith('/') or '..' in Path(n).parts for n in names):
        raise SystemExit('ERROR: unsafe archive path')
PY
printf 'RECOVERED_EXACT_V9=YES\nCOMMIT=%s\nTREE=%s\nZIP_SHA256=%s\nOUTPUT_DIR=%s\n' "$EXPECTED" "$tree" "$sha" "$out"
printf 'PRIVATE SOURCE: inspect and share privately only; no deploy or signing approval.\n'
