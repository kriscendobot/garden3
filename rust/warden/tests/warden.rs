//! The warden, driven as its callers drive it: a SHON request on the command
//! line, a YAY reply on stdout. These run unprivileged, so they cover
//! everything except the three things that need root (killing another
//! account's processes, re-owning a home, and running as another account),
//! which are checked to refuse cleanly here.

use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::{symlink, PermissionsExt};
use std::path::PathBuf;
use std::process::Command;

/// A reply is a flat YAY object, one `key: value` per line. (That it is YAY
/// upstream's parser reads back is the conformance crate's test, not this one's.)
type Reply = HashMap<String, String>;

fn parse(text: &str) -> Result<Reply, String> {
    text.lines()
        .map(|l| {
            l.split_once(": ")
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .ok_or(format!("not `key: value`: {l}"))
        })
        .collect()
}

fn warden(args: &[&str]) -> (i32, Reply) {
    // No policy, not the box's own (which allows only the real slots
    // directory): the policy has a test of its own below.
    let out = Command::new(env!("CARGO_BIN_EXE_warden"))
        .args(args)
        .env("WARDEN_POLICY", "/nonexistent/warden.yay")
        .output()
        .expect("warden runs");
    let text = String::from_utf8(out.stdout).expect("utf8");
    (
        out.status.code().unwrap_or(-1),
        parse(&text).unwrap_or_else(|e| panic!("{e}\n{text}")),
    )
}

fn field<'a>(v: &'a Reply, key: &str) -> &'a str {
    v.get(key)
        .unwrap_or_else(|| panic!("no `{key}` in the reply"))
        .as_str()
}
fn text(v: &Reply, key: &str) -> String {
    field(v, key).trim_matches('"').to_string()
}
fn int(v: &Reply, key: &str) -> i64 {
    field(v, key)
        .parse()
        .unwrap_or_else(|_| panic!("`{key}` is not an integer"))
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("warden-test-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn plant_and_clear() {
    let root = scratch("plant");
    let r = root.to_str().unwrap();
    let home = root.join("slot01");
    fs::create_dir_all(home.join("repositories/left-by-the-export")).unwrap();
    let outside = root.join("precious");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("keep"), "keep").unwrap();

    let (code, reply) = warden(&[
        "[",
        "--op",
        "plant",
        "--root",
        r,
        "--slot",
        "slot01",
        "--tombstones",
        "[",
        "repositories",
        "board",
        "]",
        "--dirs",
        "[",
        "worktrees",
        "scratch",
        "]",
        "]",
    ]);
    assert_eq!(code, 0, "{reply:?}");
    assert_eq!(field(&reply, "ok"), "true");
    assert_eq!(int(&reply, "planted"), 2);
    let tomb = home.join("repositories");
    assert!(
        tomb.is_file(),
        "a tombstone is a regular file, so nothing can be cloned under it"
    );
    assert_eq!(
        fs::metadata(&tomb).unwrap().permissions().mode() & 0o777,
        0o444
    );
    assert!(fs::read_to_string(&tomb)
        .unwrap()
        .contains("garden-project add"));
    assert!(fs::create_dir(tomb.join("x.git")).is_err());
    assert!(home.join("worktrees").is_dir() && home.join("scratch").is_dir());

    // A job leaves a symlink out of its home and a read-only tree: clear
    // removes the link and the tree, and never what the link points at.
    symlink(&outside, home.join("scratch/escape")).unwrap();
    fs::create_dir_all(home.join("scratch/locked/deep")).unwrap();
    fs::write(home.join("scratch/locked/deep/file"), "x").unwrap();
    fs::set_permissions(
        home.join("scratch/locked/deep"),
        fs::Permissions::from_mode(0o500),
    )
    .unwrap();
    fs::set_permissions(
        home.join("scratch/locked"),
        fs::Permissions::from_mode(0o500),
    )
    .unwrap();
    let (code, reply) = warden(&["[", "--op", "clear", "--root", r, "--slot", "slot01", "]"]);
    assert_eq!(code, 0, "{reply:?}");
    assert!(int(&reply, "removed") > 5);
    assert!(!home.exists(), "the home is gone");
    assert!(
        outside.join("keep").exists(),
        "what a symlink pointed at is untouched"
    );
    let (code, reply) = warden(&["[", "--op", "clear", "--root", r, "--slot", "slot01", "]"]);
    assert_eq!(
        (code, int(&reply, "removed")),
        (0, 0),
        "clearing an empty slot is a no-op"
    );
    // release: the home comes back to the caller, readable and writable.
    fs::create_dir_all(root.join("slot04/worktrees")).unwrap();
    let (code, reply) = warden(&["[", "--op", "release", "--root", r, "--slot", "slot04", "]"]);
    assert_eq!((code, int(&reply, "killed")), (0, 0), "{reply:?}");
    assert!(fs::write(root.join("slot04/worktrees/x"), "x").is_ok());
    let (code, reply) = warden(&[
        "[", "--op", "release", "--root", r, "--slot", "slot04", "--uid", "64999", "]",
    ]);
    assert_eq!(
        (code, text(&reply, "code").as_str()),
        (1, "not-root"),
        "killing another account's processes still needs root"
    );
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn run_keeps_to_the_home_the_environment_and_the_deadline() {
    let root = scratch("run");
    let r = root.to_str().unwrap();
    fs::create_dir_all(root.join("slot02")).unwrap();
    let log = root.join("log");
    let l = log.to_str().unwrap();

    std::env::set_var("WARDEN_TEST_SECRET", "must-not-leak");
    let (code, reply) = warden(&[
        "[",
        "--op",
        "run",
        "--root",
        r,
        "--slot",
        "slot02",
        "--window_s",
        "20",
        "--log",
        l,
        "--env",
        "[",
        "--PATH",
        "/usr/bin:/bin",
        "--GARDEN_JOB_ID",
        "j1",
        "]",
        "--argv",
        "[",
        "/bin/sh",
        "-c",
        "pwd; env | sort; exit 7",
        "]",
        "]",
    ]);
    assert_eq!(code, 0, "{reply:?}");
    assert_eq!(
        (int(&reply, "status"), field(&reply, "timed_out")),
        (7, "false")
    );
    let out = fs::read_to_string(&log).unwrap();
    assert!(
        out.starts_with(&format!("{}\n", root.join("slot02").display())),
        "it runs in the slot's home: {out}"
    );
    assert!(out.contains("GARDEN_JOB_ID=j1"));
    assert!(
        !out.contains("must-not-leak") && !out.contains("HOME="),
        "only the named environment is passed: {out}"
    );

    // Past its window the whole process group is stopped, children included.
    let marker = root.join("slot02/survivor");
    let script = format!("(sleep 3; touch {}) & sleep 30", marker.display());
    let (code, reply) = warden(&[
        "[",
        "--op",
        "run",
        "--root",
        r,
        "--slot",
        "slot02",
        "--window_s",
        "1",
        "--kill_after_s",
        "1",
        "--log",
        l,
        "--argv",
        "[",
        "/bin/sh",
        "-c",
        &script,
        "]",
        "]",
    ]);
    assert_eq!(code, 0, "{reply:?}");
    assert_eq!(
        (int(&reply, "status"), field(&reply, "timed_out")),
        (124, "true")
    );
    assert!(int(&reply, "elapsed_s") < 10);
    std::thread::sleep(std::time::Duration::from_secs(3));
    assert!(
        !marker.exists(),
        "a background child does not outlive the job"
    );
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn refusals() {
    let root = scratch("refuse");
    let r = root.to_str().unwrap();
    fs::create_dir_all(root.join("slot03")).unwrap();
    let cases: Vec<(Vec<&str>, i32, &str)> = vec![
        (vec!["clear", "everything"], 2, "invalid"),
        (
            vec!["[", "--op", "clear", "--root", r, "--slot", "../etc", "]"],
            1,
            "invalid",
        ),
        (
            vec!["[", "--op", "clear", "--root", r, "--slot", "slot1", "]"],
            1,
            "invalid",
        ),
        (
            vec![
                "[", "--op", "clear", "--root", "relative", "--slot", "slot01", "]",
            ],
            1,
            "invalid",
        ),
        (
            vec![
                "[", "--op", "clear", "--root", "/a/../b", "--slot", "slot01", "]",
            ],
            1,
            "invalid",
        ),
        (
            vec![
                "[", "--op", "clear", "--root", r, "--slot", "slot03", "--uid", "0", "]",
            ],
            1,
            "invalid",
        ),
        (
            vec![
                "[",
                "--op",
                "plant",
                "--root",
                r,
                "--slot",
                "slot03",
                "--tombstones",
                "[",
                "a/b",
                "]",
                "]",
            ],
            1,
            "invalid",
        ),
        (
            vec!["[", "--op", "plant", "--root", r, "--slot", "slot09", "]"],
            1,
            "absent",
        ),
        (
            vec![
                "[",
                "--op",
                "run",
                "--root",
                r,
                "--slot",
                "slot03",
                "--log",
                "/dev/null",
                "--argv",
                "[",
                "true",
                "]",
                "]",
            ],
            1,
            "invalid",
        ),
        (
            vec![
                "[",
                "--op",
                "run",
                "--root",
                r,
                "--slot",
                "slot03",
                "--window_s",
                "5",
                "--log",
                "/dev/null",
                "--uid",
                "0",
                "--gid",
                "0",
                "--argv",
                "[",
                "true",
                "]",
                "]",
            ],
            1,
            "invalid",
        ),
        (vec!["[", "--op", "format-disk", "]"], 1, "invalid"),
    ];
    for (args, want_code, want) in cases {
        let (code, reply) = warden(&args);
        assert_eq!(
            (code, text(&reply, "code").as_str()),
            (want_code, want),
            "{args:?} -> {reply:?}"
        );
        assert_eq!(field(&reply, "ok"), "false");
    }
    // Unprivileged, the three root-only acts refuse rather than half-work.
    if unsafe { libc_geteuid() } != 0 {
        for args in [
            vec![
                "[", "--op", "clear", "--root", r, "--slot", "slot03", "--uid", "64999", "]",
            ],
            vec![
                "[", "--op", "own", "--root", r, "--slot", "slot03", "--uid", "64999", "--gid",
                "64999", "]",
            ],
            vec![
                "[",
                "--op",
                "run",
                "--root",
                r,
                "--slot",
                "slot03",
                "--window_s",
                "5",
                "--log",
                "/dev/null",
                "--uid",
                "64999",
                "--gid",
                "64999",
                "--argv",
                "[",
                "true",
                "]",
                "]",
            ],
        ] {
            let (code, reply) = warden(&args);
            assert_eq!(
                (code, text(&reply, "code").as_str()),
                (1, "not-root"),
                "{args:?}"
            );
        }
        assert!(
            root.join("slot03").exists(),
            "a refused clear removed nothing"
        );
    }
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn a_policy_narrows_what_a_caller_may_name() {
    let root = scratch("policy");
    let slots = root.join("slots");
    fs::create_dir_all(slots.join("slot01")).unwrap();
    fs::create_dir_all(root.join("elsewhere/slot01")).unwrap();
    let policy = root.join("warden.yay");
    fs::write(
        &policy,
        format!(
            "slots_root: \"{}\"\nuid_max: 2099\nuid_min: 2001\n",
            slots.display()
        ),
    )
    .unwrap();
    let ask = |args: &[&str]| {
        let out = Command::new(env!("CARGO_BIN_EXE_warden"))
            .args(args)
            .env("WARDEN_POLICY", &policy)
            .output()
            .unwrap();
        (
            out.status.code().unwrap(),
            parse(&String::from_utf8(out.stdout).unwrap()).unwrap(),
        )
    };
    let elsewhere = root.join("elsewhere");
    let (code, reply) = ask(&[
        "[",
        "--op",
        "clear",
        "--root",
        elsewhere.to_str().unwrap(),
        "--slot",
        "slot01",
        "]",
    ]);
    assert_eq!(
        (code, text(&reply, "code").as_str()),
        (1, "policy"),
        "another directory is refused"
    );
    assert!(elsewhere.join("slot01").exists());
    for uid in ["1000", "2000", "2100", "65534"] {
        let (code, reply) = ask(&[
            "[",
            "--op",
            "own",
            "--root",
            slots.to_str().unwrap(),
            "--slot",
            "slot01",
            "--uid",
            uid,
            "]",
        ]);
        assert_eq!(
            (code, text(&reply, "code").as_str()),
            (1, "policy"),
            "uid {uid} is not a slot account"
        );
    }
    let (code, _) = ask(&[
        "[",
        "--op",
        "clear",
        "--root",
        slots.to_str().unwrap(),
        "--slot",
        "slot01",
        "]",
    ]);
    assert_eq!(code, 0, "the slots directory itself is allowed");
    fs::write(&policy, "not: [valid").unwrap();
    let (code, reply) = ask(&[
        "[",
        "--op",
        "clear",
        "--root",
        slots.to_str().unwrap(),
        "--slot",
        "slot01",
        "]",
    ]);
    assert_eq!(
        (code, text(&reply, "code").as_str()),
        (1, "policy"),
        "an unreadable policy fails closed"
    );
    fs::remove_dir_all(&root).unwrap();
}

extern "C" {
    #[link_name = "geteuid"]
    fn libc_geteuid() -> u32;
}
