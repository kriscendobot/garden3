#!/bin/sh
# cutover.sh — move the prior garden's repository aside and publish this one
# in a fresh repository under the old name. DRY RUN BY DEFAULT.
#
# Usage: cutover.sh [--apply] <step>
#   plan       print every step and command; contacts nothing (the default)
#   preflight  check this checkout and the tools; read-only
#   quiet      check the prior garden is quiet; read-only, uses the network
#   rename     rename the existing repository aside
#   archive    make the renamed repository read-only on GitHub
#   create     create the fresh repository under the old name
#   push       add the remote and push the branch layout; set the default branch
#   verify     confirm what is there
#
# Without --apply every step only prints what it would do. With it, a step
# does one thing and stops; nothing chains. Read RUNBOOK.md first: the order
# of the steps is the safety of this procedure.
#
# Settings (environment):
#   OLD      the repository as it is now        (default kriscendobot/garden)
#   ASIDE    the name it is moved aside to      (default garden-prior)
#   ROOT     the new garden's root checkout     (default: this script's ../..)
#   QUIET_MINUTES  how long journal2 must have been still (default 30)
#   HOSTS_CONFIRMED  space-separated "<host>=halted", one per known host, set by
#                    the person who checked each one (RUNBOOK.md, step 2)
set -eu

APPLY=0
[ "${1:-}" = --apply ] && { APPLY=1; shift; }
STEP="${1:-plan}"
OLD="${OLD:-kriscendobot/garden}"
ASIDE="${ASIDE:-garden-prior}"
OWNER="${OLD%%/*}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="${ROOT:-$(cd "$HERE/../.." && pwd -P)}"
QUIET_MINUTES="${QUIET_MINUTES:-30}"
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

preflight() {
  say "preflight (read-only):"
  command -v gh >/dev/null 2>&1 || die "gh is not installed"
  [ "$(git -C "$ROOT" symbolic-ref --short HEAD)" = shed ] || die "$ROOT is not on the shed branch"
  [ -z "$(git -C "$ROOT" status --porcelain)" ] || die "$ROOT has uncommitted changes"
  for b in $BRANCHES; do git -C "$ROOT" show-ref --verify --quiet "refs/heads/$b" || die "no local branch $b; run scripts/shards/bootstrap.sh"; done
  [ -n "$(plots)" ] || die "no plot branches; cut at least one"
  if git -C "$ROOT" remote get-url origin >/dev/null 2>&1; then die "$ROOT already has an origin ($(git -C "$ROOT" remote get-url origin)); this procedure adds it"; fi
  say "  ok: on shed, clean, branches $BRANCHES and $(plots | tr '\n' ' ')exist, no origin yet"
}

hosts_confirmed() {
  for h in $KNOWN_HOSTS; do
    case " ${HOSTS_CONFIRMED:-} " in
      *" $h=halted "*) say "  confirmed halted: $h" ;;
      *) die "host $h is not confirmed halted. The prior garden is said to be halted; check each host and set HOSTS_CONFIRMED (RUNBOOK.md, step 2)." ;;
    esac
  done
}

quiet() {
  say "quiet (read-only): has anything written to $OLD's journal2 in the last $QUIET_MINUTES minutes?"
  if [ "$APPLY" != 1 ]; then
    say "    would fetch the tip of journal2 from https://github.com/$OLD.git and compare its commit time with now"
    return 0
  fi
  tmp="$(mktemp -d)"
  git init --quiet --bare "$tmp"
  git -C "$tmp" fetch --quiet --depth 1 "https://github.com/$OLD.git" journal2 || die "cannot read journal2 of $OLD"
  last="$(git -C "$tmp" log -1 --format=%ct FETCH_HEAD)"; rm -rf "${tmp:?}"
  age=$(( ($(date +%s) - last) / 60 ))
  [ "$age" -ge "$QUIET_MINUTES" ] || die "journal2 was written $age minutes ago: a prior host is running. Find it and halt it, wait, and check again."
  say "  ok: journal2 has been still for $age minutes"
}

case "$STEP" in
  plan)
    say "The cutover, in order. Nothing is contacted by printing this."
    say ""
    say "  $OLD  is renamed to  $OWNER/$ASIDE  (with its 65 branches, issues, pull requests, keys, hooks, Pages)"
    say "  a fresh, empty  $OLD  is created, and receives:"
    for b in $BRANCHES $(plots); do say "      $b  $(git -C "$ROOT" rev-parse --short "refs/heads/$b")"; done
    say "  its default branch becomes: main"
    say ""
    say "  1. preflight   ./cutover.sh preflight"
    say "  2. verify every prior host is halted: $KNOWN_HOSTS"
    say "       (and note this machine's prior checkout, and the tower's read-only view)"
    say "  3. quiet       ./cutover.sh --apply quiet"
    say "  4. rename      HOSTS_CONFIRMED='...' ./cutover.sh --apply rename"
    say "  5. archive     ./cutover.sh --apply archive     ($OWNER/$ASIDE becomes read-only)"
    say "  6. create      HOSTS_CONFIRMED='...' ./cutover.sh --apply create"
    say "  7. access      set who may push, and branch protection, on the fresh repository"
    say "  8. push        ./cutover.sh --apply push"
    say "  9. verify      ./cutover.sh --apply verify"
    say ""
    say "Until step 6 everything is undone by unarchiving and renaming the repository back."
    ;;
  preflight) preflight ;;
  quiet) quiet ;;
  rename)
    preflight
    say "rename: every known prior host must be confirmed first."
    hosts_confirmed
    say "rename $OLD to $OWNER/$ASIDE:"
    run gh repo rename "$ASIDE" --repo "$OLD" --yes
    say "The old URL now redirects to $OWNER/$ASIDE. That redirect ENDS at step 6."
    ;;
  archive)
    say "archive $OWNER/$ASIDE: read-only on GitHub. A prior host that was missed can then"
    say "no longer push to it, which is one more way to notice it."
    run gh repo archive "$OWNER/$ASIDE" --yes
    ;;
  create)
    preflight
    hosts_confirmed
    say "create a fresh $OLD. From this moment the old URL is this new repository:"
    say "any prior host that was missed or restarted will fetch from it and fail."
    run gh repo create "$OLD" --public --description "The garden: a fleet of coding agents steered through GitHub."
    ;;
  push)
    preflight
    say "push the layout to $OLD (set access and branch protection before any host watches it):"
    run git -C "$ROOT" remote add origin "git@github.com:$OLD.git"
    # shellcheck disable=SC2046
    run git -C "$ROOT" push origin $BRANCHES $(plots)
    run gh repo edit "$OLD" --default-branch main
    ;;
  verify)
    say "verify:"
    run gh repo view "$OLD" --json defaultBranchRef,visibility
    run git ls-remote --heads "https://github.com/$OLD.git"
    run git ls-remote --heads "https://github.com/$OWNER/$ASIDE.git" main2 journal2
    ;;
  *) die "usage: cutover.sh [--apply] plan|preflight|quiet|rename|archive|create|push|verify" ;;
esac
[ "$APPLY" = 1 ] || say "(dry run: nothing was done. Pass --apply to do this one step.)"
