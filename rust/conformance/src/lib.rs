//! Holds the warden's own SHON reader and YAY writer to upstream libyay.
//!
//! This is a separate crate with its own lockfile, outside the warden's
//! workspace, so that building the warden needs no registry at all. It
//! compiles the warden's `wire.rs` directly.

#[allow(dead_code)]
#[path = "../../warden/src/wire.rs"]
mod wire;

#[cfg(test)]
mod tests {
    //! The warden reads SHON and writes YAY with its own few lines of code.
    //! These hold both to upstream libyay's reading of the same words.
    use crate::wire::*;
    use libyay::shon::parse_shon_bracket;
    use std::collections::HashMap;

    fn from_upstream(v: &libyay::Value) -> Value {
        match v {
            libyay::Value::Null => Value::Null,
            libyay::Value::Bool(b) => Value::Bool(*b),
            libyay::Value::Integer(n) => Value::Integer(n.to_string().parse().unwrap()),
            libyay::Value::String(s) => Value::String(s.clone()),
            libyay::Value::Array(a) => Value::Array(a.iter().map(from_upstream).collect()),
            libyay::Value::Object(o) => Value::Object(
                o.iter()
                    .map(|(k, v)| (k.clone(), from_upstream(v)))
                    .collect(),
            ),
            other => panic!("the warden has no {other:?}"),
        }
    }

    fn words(s: &[&str]) -> Vec<String> {
        s.iter().map(|w| w.to_string()).collect()
    }

    #[test]
    fn requests_read_as_upstream_reads_them() {
        let cases: Vec<Vec<&str>> = vec![
            vec![
                "[",
                "--op",
                "clear",
                "--root",
                "/garden/slots",
                "--slot",
                "slot01",
                "--uid",
                "2001",
                "]",
            ],
            vec![
                "[",
                "--op",
                "run",
                "--window_s",
                "2400",
                "--env",
                "[",
                "--PATH",
                "/usr/bin:/bin",
                "--GARDEN_JOB_ID",
                "fix-a",
                "]",
                "--argv",
                "[",
                "/bin/sh",
                "-c",
                "echo hi; exit 7",
                "]",
                "]",
            ],
            vec![
                "[",
                "--tombstones",
                "[",
                "repositories",
                ".git",
                ".garden-state",
                "]",
                "--dirs",
                "[]",
                "--flag",
                "-t",
                "--off",
                "-f",
                "--none",
                "-n",
                "]",
            ],
            vec![
                "[",
                "--argv",
                "[",
                "--",
                "42",
                "--",
                "-t",
                "--",
                "--",
                "--",
                "[",
                "--",
                "--key",
                "plain",
                "has space",
                "",
                "]",
                "--empty",
                "[--]",
                "]",
            ],
            vec!["[--]"],
        ];
        for case in cases {
            let args = words(&case);
            let (upstream, used) = parse_shon_bracket(&args)
                .unwrap_or_else(|e| panic!("upstream refuses {case:?}: {}", e.0));
            assert_eq!(used, args.len());
            assert_eq!(
                Value::Object(parse_request(&args).unwrap_or_else(|e| panic!("{case:?}: {e}"))),
                from_upstream(&upstream),
                "{case:?}"
            );
        }
    }

    #[test]
    fn what_the_warden_does_not_read_is_refused_not_guessed() {
        for case in [
            vec!["clear"],
            vec!["["],
            vec!["[", "--op"],
            vec!["[", "--op", "clear", "stray", "]"],
            vec!["[", "--n", "-7", "]"],
            vec!["[", "--n", "1.5", "]"],
            vec!["[", "--b", "-x", "cafe", "]"],
            vec!["[", "1", "2", "]"],
            vec!["[", "--a", "1", "]", "extra"],
            vec!["]"],
        ] {
            assert!(parse_request(&words(&case)).is_err(), "{case:?}");
        }
    }

    #[test]
    fn replies_are_yay_upstream_reads_back() {
        let doc = HashMap::from([
            ("ok".to_string(), Value::Bool(false)),
            ("code".to_string(), Value::String("io".into())),
            (
                "error".to_string(),
                Value::String("cannot raze \"/a b\"\n\ttab \\ back\u{1}slash: é 😀".into()),
            ),
            ("removed".to_string(), Value::Integer(12)),
        ]);
        let text = encode_reply(&doc);
        assert!(
            text.starts_with("code: \"io\"\nerror: "),
            "keys are sorted: {text}"
        );
        match libyay::parse(&text).expect("the reply is YAY") {
            libyay::Value::Object(back) => assert_eq!(
                Value::Object(
                    back.iter()
                        .map(|(k, v)| (k.clone(), from_upstream(v)))
                        .collect()
                ),
                Value::Object(doc)
            ),
            other => panic!("not an object: {other:?}"),
        }
    }

    #[test]
    fn the_policy_file_is_read_strictly() {
        let p =
            parse_flat("slots_root: \"/garden/slots\"\nuid_max: 2004\nuid_min: 2001\n").unwrap();
        assert_eq!(p["slots_root"], Value::String("/garden/slots".into()));
        assert_eq!(p["uid_min"], Value::Integer(2001));
        for bad in [
            "not: [valid",
            "uid_min: -1\n",
            "key \"x\"\n",
            "a: \"un\\\"closed\"\n",
            "nested:\n  x: 1\n",
        ] {
            assert!(parse_flat(bad).is_none(), "{bad:?}");
        }
    }
}
