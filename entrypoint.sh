#!/bin/sh
# entrypoint.sh — the box's first process. Runs as root, from the shed's mount.
#
# This is shell because nothing else can run yet (designs/services.md). It
# does only what must precede the garden's own runtime, and holds no garden
# logic:
#   1. accounts: the steward (the uid that owns the mounted root), whose home
#      is under the state directory, and the slot accounts slot01..slotNN,
#      each alone in its own group;
#   2. the first capability: node, fetched from the pin in bootstrap/node.pin,
#      checked against its sha256, and unpacked into the capability volume;
#   3. the warden: built by `garden host build` with the rust capability,
#      installed root-owned and setuid so the unprivileged steward can call
#      it, with the policy that confines it;
#   4. hand over to the supervisor, as the steward.
# Every step is skipped when it is already done, so a restart is quick.
#
# Usage (the container's command): supervise | <garden args...>
set -eu

ROOT="${GARDEN_ROOT:?the launcher sets GARDEN_ROOT to the mounted checkout}"
CAP="${GARDEN_CAP_ROOT:-/opt/garden/cap}"
STATE="$ROOT/.garden-state"
SLOTS="${GARDEN_SLOTS:-$ROOT/slots}"
COUNT="${GARDEN_SLOT_COUNT:-4}"
UID_BASE="${GARDEN_SLOT_UID_BASE:-2000}"
say() { printf 'entrypoint: %s\n' "$*" >&2; }
die() { say "ERROR: $*"; exit 1; }

# 1. Accounts.
steward_uid="$(stat -c %u "$ROOT")"
[ "$steward_uid" != 0 ] || die "$ROOT is owned by root; mount the garden's checkout as its owner"
getent passwd steward >/dev/null || useradd --uid "$steward_uid" --user-group --no-create-home --home-dir "$STATE/steward" --shell /bin/sh steward
i=1
while [ "$i" -le "$COUNT" ]; do
  name="$(printf 'slot%02d' "$i")"
  getent passwd "$name" >/dev/null || useradd --uid "$((UID_BASE + i))" --user-group --no-create-home --home-dir "$SLOTS/$name" --shell /bin/sh "$name"
  i=$((i + 1))
done
mkdir -p "$SLOTS" "$CAP/bin" "$STATE/steward"
# The steward builds each job's home here, and the warden then gives it to the
# slot's account, mode 0700. Slot accounts can reach their own home and list
# nothing: the directory is the steward's, 0711.
chown steward:steward "$SLOTS" && chmod 0711 "$SLOTS"
chown steward:steward "$STATE" "$STATE/steward" "$CAP" "$CAP/bin"
chmod 0700 "$STATE" "$STATE/steward"                 # keys, gh's store and the ssh key live under here

# How anything enters the box as the steward: one wrapper, so that a shell, a
# login and the supervisor all get the same environment, and none of it is a
# key. `./garden sh` and `./garden login` use it through docker exec.
mkdir -p /etc/garden /usr/local/libexec
cat >/usr/local/bin/garden-env <<EOT
#!/bin/sh
# Written by the entrypoint. Run a command with the garden's environment.
export HOME="$STATE/steward"
export PATH="$CAP/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export GARDEN_ROOT="$ROOT" GARDEN_CAP_ROOT="$CAP" GARDEN_SLOTS="$SLOTS" GARDEN_HOST="${GARDEN_HOST:-$(hostname)}"
export GARDEN_WARDEN=/usr/local/libexec/garden-warden
# The rust capability carries only the musl standard library and no C linker:
# a plain cargo build, test, fmt or clippy in the box is for musl.
export CARGO_BUILD_TARGET="$(uname -m)-unknown-linux-musl"
# Not secrets: where gh keeps its store, so that a plain \`gh auth login\` in
# this shell writes under the steward's home and nowhere in the checkout.
export GH_CONFIG_DIR="$STATE/steward/.config/gh"
export GIT_SSH_COMMAND="ssh -F $STATE/steward/.ssh/config"
cd "$ROOT"
exec "\$@"
EOT
chmod 0755 /usr/local/bin/garden-env
as_steward() { setpriv --reuid steward --regid steward --init-groups /usr/local/bin/garden-env "$@"; }

# 2. The first capability: node.
case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) arch="$(uname -m)" ;; esac
pin="$(grep "^$arch " "$ROOT/bootstrap/node.pin")" || die "there is no node pinned for this machine's architecture ($arch); see bootstrap/node.pin"
version="$(printf '%s' "$pin" | cut -d' ' -f2)"; sha="$(printf '%s' "$pin" | cut -d' ' -f3)"; url="$(printf '%s' "$pin" | cut -d' ' -f4)"
if [ ! -x "$CAP/node/$version/bin/node" ]; then
  [ "$sha" != unpinned ] || die "node is not pinned for $arch; see bootstrap/node.pin"
  say "fetching node $version"
  tmp="$(mktemp)"
  curl -fsSL --retry 3 -o "$tmp" "$url" || die "cannot fetch $url"
  echo "$sha  $tmp" | sha256sum -c - >/dev/null || die "node $version does not match its pin"
  rm -rf "${CAP:?}/node/$version.partial"
  mkdir -p "$CAP/node/$version.partial"
  tar -xJf "$tmp" -C "$CAP/node/$version.partial" --strip-components=1 --no-same-owner
  rm -f "$tmp"
  mv "$CAP/node/$version.partial" "$CAP/node/$version"
  chown -R steward:steward "$CAP/node"
  say "installed node $version"
fi
for b in node npm npx; do ln -sfn "$CAP/node/$version/bin/$b" "$CAP/bin/$b"; done
ln -sfn "$ROOT/bin/garden.js" "$CAP/bin/garden"
# The capability record should know the node the entrypoint installed.
as_steward garden capabilities adopt node >/dev/null || die "the node capability does not verify"

# The steward's home is made ready for the bot's login, which the operator
# does by hand in `./garden sh`: github.com's pinned host keys, an ssh config
# that uses them strictly, and the identity the steward commits as in the box.
as_steward garden bot prepare >/dev/null || die "the steward's home could not be prepared"

# 3. The warden. It is rebuilt at each rejuvenation; install whatever is built.
# Rebuilt whenever its source on the shed has changed since it was built.
stamp="$(cd "$ROOT/rust" && find warden Cargo.toml Cargo.lock .cargo -type f ! -path '*/tests/*' | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1)"
if [ ! -x "$CAP/warden/warden" ] || [ "$(cat "$CAP/warden/stamp" 2>/dev/null)" != "$stamp" ]; then
  say "installing the rust capability and building the warden"
  out="$(as_steward garden capabilities install rust 2>&1)" || die "the rust capability did not install (is it pinned for $arch? capabilities/README.md): $out"
  out="$(as_steward garden host build 2>&1)" || die "the warden did not build: $out"
  printf '%s\n' "$stamp" >"$CAP/warden/stamp"
fi
install -o root -g steward -m 4750 "$CAP/warden/warden" /usr/local/libexec/garden-warden
printf 'slots_root: "%s"\nuid_max: %s\nuid_min: %s\n' "$SLOTS" "$((UID_BASE + COUNT))" "$((UID_BASE + 1))" >/etc/garden/warden.yay
chmod 0644 /etc/garden/warden.yay

# 4. Hand over.
case "${1:-supervise}" in
  supervise)
    out="$(as_steward garden slots clearAll 2>&1)" || die "the slots could not be cleared: the warden is not working: $out"
    say "ready: warden $(/usr/local/libexec/garden-warden '[' --op version ']' | tr '\n' ' ')"
    exec setpriv --reuid steward --regid steward --init-groups /usr/local/bin/garden-env garden supervisor run
    ;;
  *) as_steward garden "$@" ;;
esac
