#!/bin/sh
# cutover.sh — what remains of the cutover to the fresh repository.
# DRY RUN BY DEFAULT.
#
# Already done, by the maintainer, outside this script:
#   - kriscendobot/garden was renamed to kriscendobot/gardens-of-yore;
#   - a fresh, empty, public kriscendobot/garden was created.
# This script never renames or creates a repository. `state` checks that both
# are as expected and every other step refuses if they are not.
#
# Usage: cutover.sh [--apply] <step>
#   plan       print every remaining step and command; contacts nothing (default)
#   preflight  check this checkout; read-only, local
#   state      check both repositories are as expected; read-only, anonymous
#   archive    make gardens-of-yore read-only on GitHub (skips if it already is)
#   push       add the remote, push the branch layout, make main the default
#   verify     confirm what is there
#   rename | create   refused: already done
#
# Without --apply a step only prints what it would do. With it, a step does
# one thing and stops. Read RUNBOOK.md first.
#
# Settings (environment):
#   NEW    the fresh repository         (default kriscendobot/garden)
#   YORE   the prior garden, moved aside (default kriscendobot/gardens-of-yore)
#   ROOT   the new garden's root checkout (default: this script's ../..)
#   HOSTS_CONFIRMED  space-separated "<host>=halted", one per known prior host,
#                    set by the person who checked each (RUNBOOK.md, step 2)
set -eu

APPLY=0
[ "${1:-}" = --apply ] && { APPLY=1; shift; }
STEP="${1:-plan}"
NEW="${NEW:-kriscendobot/garden}"
YORE="${YORE:-kriscendobot/gardens-of-yore}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="${ROOT:-$(cd "$HERE/../.." && pwd -P)}"
# Every host known to have run the prior garden (shed:designs/lineage.md).
KNOWN_HOSTS="endolin-garden-ece02cb4 oros-studio-garden-ce242c49 endolin-garden2-5bcdff64"
BRANCHES="main shed board archive journal library clients gate"

say() { printf '%s\n' "$*"; }
die() { printf 'cutover: %s\n' "$*" >&2; exit 1; }
run() { # run <command...>: print it; execute it only with --apply
  printf '    $ %s\n' "$*"
  [ "$APPLY" = 1 ] && "$@"
  return 0
}
plots() { git -C "$ROOT" for-each-ref --format='%(refname:short)' 'refs/heads/plot/*'; }
# Read a public repository's branch names with no credential at all.
heads() { GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote --heads "https://github.com/$1.git" 2>/dev/null | sed 's|.*refs/heads/||'; }

preflight() {
  say "preflight (read-only, local):"
  [ "$(git -C "$ROOT" symbolic-ref --short HEAD)" = shed ] || die "$ROOT is not on the shed branch"
  [ -z "$(git -C "$ROOT" status --porcelain)" ] || die "$ROOT has uncommitted changes"
  for b in $BRANCHES; do git -C "$ROOT" show-ref --verify --quiet "refs/heads/$b" || die "no local branch $b; run scripts/shards/bootstrap.sh"; done
  [ -n "$(plots)" ] || die "no plot branches; cut at least one"
  say "  ok: on shed, clean, branches $BRANCHES and $(plots | tr '\n' ' ')exist"
}

hosts_confirmed() {
  for h in $KNOWN_HOSTS; do
    case " ${HOSTS_CONFIRMED:-} " in
      *" $h=halted "*) say "  confirmed halted: $h" ;;
      *) die "host $h is not confirmed halted. A prior host that was missed or restarted now talks to $NEW; check each and set HOSTS_CONFIRMED (RUNBOOK.md, step 2)." ;;
    esac
  done
}

state() {
  say "state (read-only, anonymous):"
  if [ "$APPLY" != 1 ]; then
    say "    would list the branches of https://github.com/$YORE.git and https://github.com/$NEW.git"
    return 0
  fi
  yore="$(heads "$YORE")"; new="$(heads "$NEW")"
  printf '%s\n' "$yore" | grep -qx main2 || die "$YORE has no main2: it is not the prior garden, or cannot be read"
  printf '%s\n' "$yore" | grep -qx journal2 || die "$YORE has no journal2"
  say "  ok: $YORE is the prior garden ($(printf '%s\n' "$yore" | wc -l) branches)"
  if printf '%s\n' "$new" | grep -qx main2; then die "$NEW still holds the prior garden's branches: the rename has not happened"; fi
  if [ -z "$new" ]; then say "  ok: $NEW exists and is empty: ready for the first push"
  elif printf '%s\n' "$new" | grep -qx shed; then say "  ok: $NEW already holds the new layout: the first push has been done"
  else die "$NEW holds branches that are neither the prior garden's nor the new layout: $(printf '%s' "$new" | tr '\n' ' ')"; fi
}

case "$STEP" in
  plan)
    say "The cutover. Nothing is contacted by printing this."
    say ""
    say "  done   $NEW was renamed to $YORE (the maintainer)"
    say "  done   a fresh, empty $NEW was created (the maintainer)"
    say ""
    say "  remaining, in order:"
    say "  1. preflight   ./cutover.sh preflight"
    say "  2. verify every prior host is halted: $KNOWN_HOSTS"
    say "       They now reach the NEW repository by the old name. This matters more, not less, now."
    say "  3. state       ./cutover.sh --apply state"
    say "  4. archive     ./cutover.sh --apply archive     ($YORE becomes read-only)"
    say "  5. access      set who may push, and branch protection, on $NEW"
    say "  6. the bot logs in on the publishing host (./garden login), if the push is to be the bot's"
    say "  7. push        HOSTS_CONFIRMED='...' ./cutover.sh --apply push"
    say "       which pushes:"
    for b in $BRANCHES $(plots); do say "           $b  $(git -C "$ROOT" rev-parse --short "refs/heads/$b")"; done
    say "       and makes main the default branch"
    say "  8. verify      ./cutover.sh --apply verify"
    ;;
  preflight) preflight ;;
  state) state ;;
  rename | create)
    die "'$STEP' is already done: $YORE is the prior garden and $NEW is the fresh repository. This script does not rename or create repositories. See: cutover.sh state"
    ;;
  archive)
    say "archive $YORE: read-only on GitHub. A prior host that was missed can then no longer push to it."
    if [ "$APPLY" = 1 ] && [ "$(gh repo view "$YORE" --json isArchived --jq .isArchived)" = true ]; then
      say "  already archived; nothing to do"
    else
      run gh repo archive "$YORE" --yes
    fi
    ;;
  push)
    preflight
    hosts_confirmed
    [ "$APPLY" != 1 ] || state
    say "push the layout to $NEW (access and branch protection should be set first):"
    if git -C "$ROOT" remote get-url origin >/dev/null 2>&1; then
      [ "$(git -C "$ROOT" remote get-url origin)" = "git@github.com:$NEW.git" ] || die "$ROOT has another origin: $(git -C "$ROOT" remote get-url origin)"
      say "    origin is already git@github.com:$NEW.git"
    else
      run git -C "$ROOT" remote add origin "git@github.com:$NEW.git"
    fi
    # shellcheck disable=SC2046
    run git -C "$ROOT" push origin $BRANCHES $(plots)
    run gh repo edit "$NEW" --default-branch main
    ;;
  verify)
    say "verify:"
    run gh repo view "$NEW" --json defaultBranchRef,visibility
    run gh repo view "$YORE" --json isArchived
    [ "$APPLY" != 1 ] || { say "    branches of $NEW:"; heads "$NEW" | sed 's/^/      /'; }
    ;;
  *) die "usage: cutover.sh [--apply] plan|preflight|state|archive|push|verify" ;;
esac
[ "$APPLY" = 1 ] || say "(dry run: nothing was done. Pass --apply to do this one step.)"
