# journal

The garden's slow record: what a later reader needs, and no telemetry.

| Path | Holds |
| --- | --- |
| `entries/<YYYY>/<MM>/<date>-<host>.md` | one digest per host per day, pressed from that day's notes |
| `config/` | steering the maintainers set: `maintainers.yay`, `arcs.yay`, `pools.yay`, `hosts.yay` |
| `budget/weeks/<week>.yay` | one consolidated statement per week |
| `mail/` | mail carried from the tower, and receipts for it |

Heartbeats, cursors, usage rows and decision logs never come here; they live on
each host's own `host/<name>` branch and are consolidated weekly.
Design: `shed:designs/journal.md`.
