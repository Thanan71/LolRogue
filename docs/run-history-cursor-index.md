# Run history cursor index

Local measurement, 7 October 2026, PostgreSQL in the Supabase development stack.
The client uses `(created_at DESC, id DESC)` for a stable order, preserves the
original timestamp precision and requests at most 101 rows including a sentinel.
The cursor's `created_at <= timestamp` bound lets PostgreSQL seek into the index;
the strict timestamp/ID condition then excludes the previously displayed row.

The existing `(player_id, completed_at DESC)` index cannot serve this ordering.
The new `runs_player_history_cursor_idx` indexes
`(player_id, created_at DESC, id DESC)` and has a schema check in
`scripts/check-measured-database-indexes.mjs`.

Measurement: `scripts/sql/measure-run-history-cursor.sql` inserts 10,000 local
legacy fixture rows inside a transaction, queries an older page at offset 5,000,
and rolls back every inserted row. It requires one existing fixture player.
The baseline temporarily dropped the new index in the same rollback-only
transaction. Both plans used the actual SQL predicate emitted by the repository.

| Plan | Execution | Shared buffers | Rows read before limit |
| --- | ---: | ---: | ---: |
| Existing indexes: sequential scan + top-N sort | 6.322 ms | 668 | 10,000 |
| Cursor index: bounded index scan, no run sort | 0.208 ms | 6 | 22 |

These are local synthetic measurements, not production latency promises.
Actual timings vary with cache, player history size and concurrent traffic.
The planner evidence supports this specific ordering and bounded seek.
The reset-only `unused_index` advisor finding is allowed until 31 October 2026,
with this measurement as its justification; production usage needs a later review.
