# archive

Jobs that have left the board, one YAY record each, sharded by month:
`done/<YYYY>/<MM>/<id>.yay` is the job as it left (its outcome, level, cost and
report).

At each quiescence, months older than the retention window are rolled up into
`rollup/<YYYY>-<MM>.yay` (one entry per job; bodies and reports dropped) and the
branch is rewritten to a fresh root. The full history stays under
`refs/archive/`. Design: `shed:designs/quiescence.md`. Clone shallow; never walk
history.
