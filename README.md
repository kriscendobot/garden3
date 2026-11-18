# board

The job board, and nothing else. Design: `shed:designs/board.md`.

| Path | Holds |
| --- | --- |
| `open/<id>.yay` | posted, claimable when its `after` jobs have left the board |
| `held/<id>.yay` | parked: awaiting a maintainer, or the steps of its own hand-off |
| `claimed/<host>/<id>.yay` | claimed; the accepted push is the claim |
| `failed/<id>.yay` | failed terminally; blocks its dependents until a maintainer resolves it |
| `quiescence.yay` | the fleet's coordinated-restart state |
| `EPOCH` | this branch's truncation epoch |

Completed jobs leave for the `archive` branch. Clone this branch shallow and
never walk its history: it is rewritten to a fresh root at every quiescence.
Every record is YAY; the body a worker reads is the `body` block of its record. Write only through the board service (`shed:src/boardService.js`).
