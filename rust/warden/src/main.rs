//! warden — the garden's privileged helper.
//!
//! The garden's services are JavaScript and run unprivileged. The few things
//! that need root inside the box are here, in one small program with no
//! runtime: killing every process of a slot's account, razing and planting a
//! slot's home, giving the home to the account, and running a job as that
//! account under its deadline. See designs/slots.md and designs/services.md.
//!
//! The request is one YAY value written as SHON on the command line:
//!
//!     warden [ --op clear --root /garden/slots --slot slot01 --uid 2001 ]
//!
//! The reply is one YAY document on stdout: `ok: true` and the operation's
//! results, or `ok: false` with `code` and `error`. Exit status: 0 done,
//! 1 refused, 2 the request could not be read.
//!
//! The warden takes everything it acts on as arguments, so its authority is
//! what its caller names, narrowed by the one policy file the entrypoint may
//! lay down (see `policy`). Every path it touches is `<root>/<slot>` for a
//! slot named `slotNN`; it follows no symbolic link when it removes or
//! re-owns a tree.

mod wire;

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::os::unix::fs::{lchown, MetadataExt, PermissionsExt};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use wire::{encode_reply, parse_flat, parse_request, Value};

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
    fn geteuid() -> u32;
}
const SIGTERM: i32 = 15;
const SIGKILL: i32 = 9;

struct Refusal {
    code: &'static str,
    message: String,
}
type Outcome = Result<HashMap<String, Value>, Refusal>;

fn refuse<T>(code: &'static str, message: impl Into<String>) -> Result<T, Refusal> {
    Err(Refusal {
        code,
        message: message.into(),
    })
}

fn text(req: &HashMap<String, Value>, key: &str) -> Result<String, Refusal> {
    match req.get(key) {
        Some(Value::String(s)) => Ok(s.clone()),
        _ => refuse("invalid", format!("the request needs a string `{key}`")),
    }
}

fn number(req: &HashMap<String, Value>, key: &str) -> Result<Option<u64>, Refusal> {
    match req.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Integer(n)) => Ok(Some(*n)),
        _ => refuse("invalid", format!("`{key}` is an integer")),
    }
}

fn strings(req: &HashMap<String, Value>, key: &str) -> Result<Vec<String>, Refusal> {
    match req.get(key) {
        None => Ok(vec![]),
        Some(Value::Array(items)) => items
            .iter()
            .map(|v| match v {
                Value::String(s) => Ok(s.clone()),
                _ => refuse("invalid", format!("`{key}` is a list of strings")),
            })
            .collect(),
        _ => refuse("invalid", format!("`{key}` is a list of strings")),
    }
}

/// The policy the box's entrypoint lays down, as root, when it installs the
/// warden for the unprivileged steward to call: the one slots directory the
/// warden may act in and the range of account ids that are slots. With a
/// policy present, a request naming any other root or uid is refused, so
/// holding the right to call the warden is not holding root. Without one (a
/// host with no accounts, the tests) the caller is trusted as itself.
const POLICY_PATH: &str = "/etc/garden/warden.yay";

struct Policy {
    slots_root: String,
    uid_min: u64,
    uid_max: u64,
}

fn policy() -> Result<Option<Policy>, Refusal> {
    // Only a debug build may be pointed at another policy file, for its tests.
    let path = if cfg!(debug_assertions) {
        std::env::var("WARDEN_POLICY").unwrap_or_else(|_| POLICY_PATH.into())
    } else {
        POLICY_PATH.into()
    };
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return refuse("policy", format!("cannot read {path}: {e}")),
    };
    match parse_flat(&text) {
        Some(doc) => Ok(Some(Policy {
            slots_root: text_of(&doc, "slots_root")?,
            uid_min: number(&doc, "uid_min")?.unwrap_or(u64::MAX),
            uid_max: number(&doc, "uid_max")?.unwrap_or(0),
        })),
        None => refuse(
            "policy",
            format!("{path} is not a flat YAY object of strings and integers"),
        ),
    }
}

fn text_of(doc: &HashMap<String, Value>, key: &str) -> Result<String, Refusal> {
    text(doc, key).map_err(|_| Refusal {
        code: "policy",
        message: format!("the policy needs `{key}`"),
    })
}

/// The uid and gid a request names, checked against the policy.
fn account(req: &HashMap<String, Value>) -> Result<Option<(u32, u32)>, Refusal> {
    let uid = match number(req, "uid")? {
        None => return Ok(None),
        Some(u) => u,
    };
    let gid = number(req, "gid")?.unwrap_or(uid);
    if let Some(p) = policy()? {
        if uid < p.uid_min || uid > p.uid_max || gid < p.uid_min || gid > p.uid_max {
            return refuse(
                "policy",
                format!(
                    "uid {uid} is not a slot account ({}..={})",
                    p.uid_min, p.uid_max
                ),
            );
        }
    }
    Ok(Some((uid as u32, gid as u32)))
}

/// A slot is named slotNN, and its home is <root>/<slot>, with <root> absolute.
fn home_of(req: &HashMap<String, Value>) -> Result<PathBuf, Refusal> {
    let root = text(req, "root")?;
    let slot = text(req, "slot")?;
    let b = slot.as_bytes();
    if !(b.len() == 6 && slot.starts_with("slot") && b[4].is_ascii_digit() && b[5].is_ascii_digit())
    {
        return refuse("invalid", format!("`{slot}` is not a slot name (slotNN)"));
    }
    let root = Path::new(&root);
    if !root.is_absolute()
        || root
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return refuse("invalid", "`root` is an absolute path with no `..`");
    }
    if let Some(p) = policy()? {
        if root != Path::new(&p.slots_root) {
            return refuse(
                "policy",
                format!("{} is not the slots directory", root.display()),
            );
        }
    }
    Ok(root.join(slot))
}

/// A plain file or directory name: no separators, not `.` or `..`.
fn plain_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains('/') && !name.contains('\0')
}

/// Remove a tree without following symbolic links. Read-only entries are made
/// writable first, since a job may have left them so.
fn raze(path: &Path) -> std::io::Result<u64> {
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e),
    };
    let mut removed = 1;
    if meta.file_type().is_dir() {
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
        for entry in fs::read_dir(path)? {
            removed += raze(&entry?.path())?;
        }
        fs::remove_dir(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(removed)
}

/// Every process whose real uid is `uid`, from /proc.
fn processes_of(uid: u32) -> Vec<i32> {
    let mut pids = vec![];
    if let Ok(entries) = fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if let Some(pid) = name.to_str().and_then(|s| s.parse::<i32>().ok()) {
                if entry.metadata().map(|m| m.uid() == uid).unwrap_or(false) {
                    pids.push(pid);
                }
            }
        }
    }
    pids
}

/// clear: no process, no file. Kills every process of `uid` (when given; this
/// needs root, and is refused for uid 0 and for the caller's own uid), then
/// razes the home.
fn clear(req: &HashMap<String, Value>) -> Outcome {
    let home = home_of(req)?;
    let mut killed = 0u64;
    if let Some((uid, _)) = account(req)? {
        let me = unsafe { geteuid() };
        if uid == 0 || uid == me {
            return refuse(
                "invalid",
                "refusing to kill the processes of root or of the caller",
            );
        }
        if me != 0 {
            return refuse("not-root", "killing a slot's processes needs root");
        }
        for _ in 0..20 {
            let pids = processes_of(uid);
            if pids.is_empty() {
                break;
            }
            for pid in pids {
                if unsafe { kill(pid, SIGKILL) } == 0 {
                    killed += 1;
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if !processes_of(uid).is_empty() {
            return refuse("survivors", format!("uid {uid} still has processes"));
        }
    }
    let removed = raze(&home).map_err(|e| Refusal {
        code: "io",
        message: format!("cannot raze {}: {e}", home.display()),
    })?;
    let mut out = HashMap::new();
    out.insert("killed".into(), Value::Integer(killed));
    out.insert("removed".into(), Value::Integer(removed));
    Ok(out)
}

const TOMBSTONE: &str = "\
TOMBSTONE: there is no \"{name}\" here, on purpose.

This directory is a job's home: an export of the garden's shed with one plot's
roles and skills laid over it. It is not the garden's root, and the garden's
own repositories and records are not yours to clone, read or write from here.

  - To work on a project, run:   garden-project add <org>/<name> [<ref>]
    It gives you the one checkout of that project this job may have, under
    worktrees/<org>/<name>/, on a branch named for the job.
  - Do not git clone anything into this home.
  - Put scratch files under scratch/. Everything here is deleted when the job
    ends; only your commits and what you leave in outbox/ are carried out.
";

/// plant: put a read-only regular file at each tombstone name, so that
/// `mkdir`, `git clone` and `git worktree add` at that path fail at once and
/// the file itself says where to go instead; and make the working directories.
fn plant(req: &HashMap<String, Value>) -> Outcome {
    let home = home_of(req)?;
    if !home.is_dir() {
        return refuse("absent", format!("{} is not a directory", home.display()));
    }
    let io = |e: std::io::Error| Refusal {
        code: "io",
        message: e.to_string(),
    };
    let tombstones = strings(req, "tombstones")?;
    for name in &tombstones {
        if !plain_name(name) {
            return refuse("invalid", format!("`{name}` is not a plain name"));
        }
        let path = home.join(name);
        raze(&path).map_err(io)?;
        fs::write(&path, TOMBSTONE.replace("{name}", name)).map_err(io)?;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).map_err(io)?;
    }
    for name in strings(req, "dirs")? {
        if !plain_name(&name) {
            return refuse("invalid", format!("`{name}` is not a plain name"));
        }
        fs::create_dir_all(home.join(name)).map_err(io)?;
    }
    let mut out = HashMap::new();
    out.insert("planted".into(), Value::Integer(tombstones.len() as u64));
    Ok(out)
}

fn chown_tree(path: &Path, uid: u32, gid: u32) -> std::io::Result<()> {
    lchown(path, Some(uid), Some(gid))?;
    if fs::symlink_metadata(path)?.file_type().is_dir() {
        for entry in fs::read_dir(path)? {
            chown_tree(&entry?.path(), uid, gid)?;
        }
    }
    Ok(())
}

/// own: give the home to the slot's account and close it to everyone else.
fn own(req: &HashMap<String, Value>) -> Outcome {
    let home = home_of(req)?;
    let (uid, gid) = match account(req)? {
        Some((u, g)) if u != 0 => (u, g),
        _ => return refuse("invalid", "own needs a nonzero `uid`"),
    };
    if unsafe { geteuid() } != 0 {
        return refuse("not-root", "changing a home's owner needs root");
    }
    chown_tree(&home, uid, gid).map_err(|e| Refusal {
        code: "io",
        message: e.to_string(),
    })?;
    fs::set_permissions(&home, fs::Permissions::from_mode(0o700)).map_err(|e| Refusal {
        code: "io",
        message: e.to_string(),
    })?;
    Ok(HashMap::new())
}

/// run: run a job's command in its home, in its own process group, with only
/// the environment the request names, as the slot's account when `uid` and
/// `gid` are given (root only), and stop it at its deadline: TERM to the whole
/// group at `window_s`, KILL `kill_after_s` later. Output goes to `log`.
fn run(req: &HashMap<String, Value>) -> Outcome {
    let home = home_of(req)?;
    let argv = strings(req, "argv")?;
    if argv.is_empty() {
        return refuse("invalid", "run needs an `argv`");
    }
    let window = number(req, "window_s")?.unwrap_or(0);
    if window == 0 {
        return refuse(
            "invalid",
            "run needs a `window_s`: no job runs without a deadline",
        );
    }
    let kill_after = number(req, "kill_after_s")?.unwrap_or(30);
    let log = text(req, "log")?;
    let io = |e: std::io::Error| Refusal {
        code: "io",
        message: e.to_string(),
    };
    let out = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log)
        .map_err(io)?;
    let err = out.try_clone().map_err(io)?;
    let mut cmd = Command::new(&argv[0]);
    cmd.args(&argv[1..])
        .current_dir(&home)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(out)
        .stderr(err)
        .process_group(0);
    if let Some(Value::Object(env)) = req.get("env") {
        for (k, v) in env {
            match v {
                Value::String(s) => {
                    cmd.env(k, s);
                }
                _ => return refuse("invalid", "`env` maps names to strings"),
            }
        }
    }
    if let Some((uid, gid)) = account(req)? {
        if uid == 0 {
            return refuse("invalid", "a job never runs as root");
        }
        if unsafe { geteuid() } != 0 {
            return refuse("not-root", "running as another account needs root");
        }
        cmd.uid(uid).gid(gid);
    }
    let started = Instant::now();
    let mut child = cmd.spawn().map_err(|e| Refusal {
        code: "spawn",
        message: format!("cannot start {}: {e}", argv[0]),
    })?;
    let group = -(child.id() as i32);
    let (mut timed_out, mut termed) = (false, false);
    let status = loop {
        if let Some(status) = child.try_wait().map_err(io)? {
            break status;
        }
        let elapsed = started.elapsed().as_secs();
        if !termed && elapsed >= window {
            timed_out = true;
            termed = true;
            unsafe { kill(group, SIGTERM) };
        } else if termed && elapsed >= window + kill_after {
            unsafe { kill(group, SIGKILL) };
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    // Nothing the job started outlives it.
    unsafe { kill(group, SIGKILL) };
    let code = if timed_out {
        124
    } else {
        status.code().unwrap_or(137)
    };
    let mut out = HashMap::new();
    out.insert("status".into(), Value::Integer(code as u64));
    out.insert("timed_out".into(), Value::Bool(timed_out));
    out.insert(
        "elapsed_s".into(),
        Value::Integer(started.elapsed().as_secs()),
    );
    Ok(out)
}

fn reply(mut doc: HashMap<String, Value>, ok: bool) {
    doc.insert("ok".into(), Value::Bool(ok));
    let _ = std::io::stdout().write_all(encode_reply(&doc).as_bytes());
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let request = match parse_request(&args) {
        Ok(req) => req,
        Err(e) => {
            reply(
                HashMap::from([
                    ("code".into(), Value::String("invalid".into())),
                    ("error".into(), Value::String(e)),
                ]),
                false,
            );
            std::process::exit(2);
        }
    };
    let op = match request.get("op") {
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    };
    let outcome = match op.as_str() {
        "clear" => clear(&request),
        "plant" => plant(&request),
        "own" => own(&request),
        "run" => run(&request),
        "version" => Ok(HashMap::from([(
            "version".into(),
            Value::String(env!("CARGO_PKG_VERSION").into()),
        )])),
        _ => refuse(
            "invalid",
            format!("unknown op `{op}` (clear, plant, own, run, version)"),
        ),
    };
    match outcome {
        Ok(doc) => reply(doc, true),
        Err(r) => {
            reply(
                HashMap::from([
                    ("code".into(), Value::String(r.code.into())),
                    ("error".into(), Value::String(r.message)),
                ]),
                false,
            );
            std::process::exit(1);
        }
    }
}
