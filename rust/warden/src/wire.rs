//! The two notations the warden speaks: SHON in, YAY out.
//!
//! The warden is built with no dependencies at all, so that a host can build it
//! with nothing but rustc, cargo and the musl standard library: no C compiler,
//! no system linker, no registry (designs/services.md). So both notations are
//! read and written here, for exactly the subset the warden uses, and the
//! `conformance` crate beside this one holds them to upstream libyay's reading
//! of the same words.

use std::collections::HashMap;

/// The values a request or a reply is made of.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Integer(u64),
    String(String),
    Array(Vec<Value>),
    Object(HashMap<String, Value>),
}

fn is_key(word: &str) -> bool {
    let k = match word.strip_prefix("--") {
        Some(k) if !k.is_empty() => k,
        _ => return false,
    };
    let mut chars = k.chars();
    let first = chars.next().unwrap();
    (first.is_ascii_alphabetic() || first == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Read one SHON value starting at `args[i]`. The subset the garden sends:
/// null, booleans, non-negative integers, strings (with the `--` escape),
/// arrays and objects. Anything else is an error, never a guess.
fn shon_value(args: &[String], i: &mut usize) -> Result<Value, String> {
    let word = args.get(*i).ok_or("a value is missing")?.as_str();
    *i += 1;
    match word {
        "-n" => Ok(Value::Null),
        "-t" => Ok(Value::Bool(true)),
        "-f" => Ok(Value::Bool(false)),
        "[--]" => Ok(Value::Object(HashMap::new())),
        "[]" => Ok(Value::Array(vec![])),
        "--" => {
            let next = args.get(*i).ok_or("-- needs a word")?;
            *i += 1;
            Ok(Value::String(next.clone()))
        }
        "[" => {
            if args.get(*i).map(|w| is_key(w)).unwrap_or(false) {
                let mut map = HashMap::new();
                while args.get(*i).map(String::as_str) != Some("]") {
                    let key = args.get(*i).ok_or("missing ]")?;
                    if !is_key(key) {
                        return Err(format!("expected a --key, found {key}"));
                    }
                    *i += 1;
                    map.insert(key[2..].to_string(), shon_value(args, i)?);
                }
                *i += 1;
                Ok(Value::Object(map))
            } else {
                let mut list = vec![];
                while args.get(*i).map(String::as_str) != Some("]") {
                    if args.get(*i).is_none() {
                        return Err("missing ]".into());
                    }
                    list.push(shon_value(args, i)?);
                }
                *i += 1;
                Ok(Value::Array(list))
            }
        }
        "]" => Err("unexpected ]".into()),
        "-I" | "-i" | "-N" | "-x" | "-b" | "-s" => {
            Err(format!("{word} is not something the warden reads"))
        }
        w if !w.is_empty() && w.bytes().all(|b| b.is_ascii_digit()) => w
            .parse::<u64>()
            .map(Value::Integer)
            .map_err(|_| format!("integer {w} is too large")),
        w if w.starts_with('-')
            && w[1..].bytes().all(|b| b.is_ascii_digit() || b == b'.')
            && w.len() > 1 =>
        {
            Err(format!(
                "{w}: the warden reads no negative or fractional numbers"
            ))
        }
        w if w.contains('.') && w.bytes().all(|b| b.is_ascii_digit() || b == b'.') => {
            Err(format!("{w}: the warden reads no fractional numbers"))
        }
        w if w.starts_with("--") => Err(format!("unexpected key {w}")),
        w => Ok(Value::String(w.to_string())),
    }
}

/// Read a whole command line as one SHON object.
pub fn parse_request(args: &[String]) -> Result<HashMap<String, Value>, String> {
    let mut i = 0;
    match shon_value(args, &mut i)? {
        Value::Object(map) if i == args.len() => Ok(map),
        _ => Err("the request is one SHON object: warden [ --op ... ]".into()),
    }
}

fn yay_string(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 0x20 || c as u32 == 0x7f => {
                out.push_str(&format!("\\u{{{:04X}}}", c as u32))
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Write a reply: a flat YAY object of strings, integers and booleans, keys
/// sorted, one per line.
pub fn encode_reply(doc: &HashMap<String, Value>) -> String {
    let mut keys: Vec<&String> = doc.keys().collect();
    keys.sort();
    let mut out = String::new();
    for k in keys {
        let v = match &doc[k] {
            Value::Null => "null".to_string(),
            Value::Bool(b) => b.to_string(),
            Value::Integer(n) => n.to_string(),
            Value::String(s) => yay_string(s),
            Value::Array(_) | Value::Object(_) => "null".to_string(),
        };
        out.push_str(&format!("{k}: {v}\n"));
    }
    out
}

/// Read the policy file: a flat YAY object of strings and integers, as the
/// entrypoint writes it. Returns None if any line is not of that shape.
pub fn parse_flat(text: &str) -> Option<HashMap<String, Value>> {
    let mut map = HashMap::new();
    for line in text
        .lines()
        .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
    {
        let (key, value) = line.split_once(": ")?;
        if key.is_empty()
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            return None;
        }
        let v = if value.len() >= 2
            && value.starts_with('"')
            && value.ends_with('"')
            && !value[1..value.len() - 1].contains(['"', '\\'])
        {
            Value::String(value[1..value.len() - 1].to_string())
        } else {
            Value::Integer(value.parse::<u64>().ok()?)
        };
        map.insert(key.to_string(), v);
    }
    Some(map)
}
