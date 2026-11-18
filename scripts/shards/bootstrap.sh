#!/bin/bash
# bootstrap.sh — create the garden's shards and their root worktrees. Idempotent.
#
# Usage: bootstrap.sh [--push] [--host <name>]
#
# For each of main, board, archive, journal, library, clients and gate: if the branch does not
# exist (locally, or on origin when there is one), build an orphan root commit
# from scripts/shards/seed/<branch>/ without touching any working tree, then
# add a worktree of it at <root>/<branch>/. With --host, also create the
# single-writer shard host/<name> (no worktree). Seeds are used only at
# creation; afterwards each branch's own README is canonical.
#
# Without --push nothing leaves this repository. The first push of a fresh
# garden is part of the cutover (gate:cutover/RUNBOOK.md), not of this script.
#
# Ported from the tower's scripts/tower/bootstrap-branches.sh. The tower pushes
# to a local hub; the garden's origin is GitHub, so pushing is opt-in.
#
# This is shell on purpose: it runs once, on a host, before any of the
# garden's runtime exists (designs/services.md). It holds no garden logic.

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GARDEN_ROOT="${GARDEN_ROOT:-$(cd "$HERE/../.." && pwd)}"
BRANCHES="main board archive journal library clients gate"
log() { printf 'bootstrap: %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
valid_name() { [[ "${1:-}" =~ ^[a-z0-9][a-z0-9._-]{0,99}$ ]]; }

push=0 host=""
while [ $# -gt 0 ]; do
  case "$1" in
    --push) push=1 ;;
    --host) host="${2:?--host needs a name}"; shift ;;
    *) die "usage: bootstrap.sh [--push] [--host <name>]" ;;
  esac
  shift
done

cd "$GARDEN_ROOT"
git rev-parse --verify --quiet HEAD >/dev/null || die "commit the shed before bootstrapping shards"
has_origin=0; git remote get-url origin >/dev/null 2>&1 && has_origin=1
[ "$push" = 0 ] || [ "$has_origin" = 1 ] || die "--push needs an origin"

# seed_commit <branch> <seed-dir> — print the sha of a parentless commit of the
# seed directory.
seed_commit() {
  local branch="$1" seed="$2" index tree msg
  index="$(git rev-parse --absolute-git-dir)/index.seed.${branch//\//-}"
  rm -f "$index"
  tree="$(GIT_INDEX_FILE="$index" git --work-tree="$seed" add -A \
    && GIT_INDEX_FILE="$index" git write-tree)"
  rm -f "$index"
  msg="$branch: initialized"
  [ -n "${GARDEN_COMMIT_TRAILER:-}" ] && msg="$msg"$'\n\n'"$GARDEN_COMMIT_TRAILER"
  git commit-tree "$tree" -m "$msg"
}

make_branch() {
  local branch="$1" seed="$2" commit
  if git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null; then return 0; fi
  if [ "$has_origin" = 1 ] && git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null; then
    git branch --quiet --track "$branch" "origin/$branch"
    return 0
  fi
  commit="$(seed_commit "$branch" "$seed")"
  git update-ref "refs/heads/$branch" "$commit" ""
  log "created $branch at ${commit:0:12}"
  if [ "$push" = 1 ]; then
    [ "$has_origin" = 1 ] || die "--push needs an origin"
    git push --quiet origin "$commit:refs/heads/$branch"
  fi
}

for branch in $BRANCHES; do
  valid_name "$branch" || die "bad branch name $branch"
  make_branch "$branch" "$HERE/seed/$branch"
  if [ ! -e "$GARDEN_ROOT/$branch/.git" ]; then
    git worktree add --quiet "$GARDEN_ROOT/$branch" "$branch"
    log "worktree $branch/"
  fi
done

if [ -n "$host" ]; then
  valid_name "$host" || die "bad host name $host"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  printf '# host/%s\n\nWritten only by the host %s: its heartbeat, capability record, usage rows and\nquiescence acknowledgements. See shed:designs/hosts.md.\n' "$host" "$host" >"$tmp/README.md"
  make_branch "host/$host" "$tmp"
fi
