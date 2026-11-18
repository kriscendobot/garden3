# clients

Orders for client hosts: machines that run a garden on capacity someone has
lent, such as the Oros Studio host. This branch is control only. A client host
reports on its own `host/<name>` branch, never here.

`clients/<host>.yay` is the state the maintainers want that host's garden in:
which shed revision, how many slots, which plots and capabilities, and any
standing orders (quiesce, drain, resume, restart, clear-scratch).

Whoever can push to this branch controls every host that watches it: that is
the trust boundary, and the reason push access to the repository is managed
with care. A host watches only if its owner has written a consent file on that
machine, and stops when the owner removes it. What an order can and cannot ask
is in `shed:designs/clients.md`.
