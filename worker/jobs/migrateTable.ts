/**
 * migrate-table job: copy ALL rows of one table from Neon (source) into the
 * Hetzner `app` DB (target), idempotently and re-runnably.
 *
 * - Introspects the source's columns at runtime (copies whatever exists).
 * - Reads in keyset-paginated batches ordered by the conflict key (stable,
 *   no LIMIT/OFFSET drift) — handles the 78k missing_persons table memory-safely.
 * - Writes with INSERT ... ON CONFLICT (key) DO UPDATE / DO NOTHING per policy.
 * - Re-running pulls new/changed rows and updates existing ones, never dupes
 *   (this is the "move multiple syncs" requirement).
 */
import type { Pool } from "pg";
import { sourcePool, targetPool } from "../db";
import type { TableSpec } from "../tables";

const BATCH = 500;

/** Columns that actually exist in the source table, in ordinal order. */
async function sourceColumns(src: Pool, table: string): Promise<string[]> {
  const { rows } = await src.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name=$1 order by ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name as string);
}

const ident = (c: string) => `"${c.replace(/"/g, '""')}"`;

export interface MigrateTableResult {
  table: string;
  read: number;
  upserted: number;
}

export async function migrateTable(spec: TableSpec): Promise<MigrateTableResult> {
  const src = sourcePool();
  const tgt = targetPool();

  const cols = await sourceColumns(src, spec.name);
  if (cols.length === 0) {
    // Table doesn't exist in source — nothing to copy. (Target may still have it.)
    return { table: spec.name, read: 0, upserted: 0 };
  }
  // Only conflict-update columns that aren't part of the key.
  const updateCols = cols.filter((c) => !spec.conflict.includes(c));

  const colList = cols.map(ident).join(", ");
  const keyList = spec.conflict.map(ident).join(", ");
  const onConflict =
    spec.policy === "ignore" || updateCols.length === 0
      ? `ON CONFLICT (${keyList}) DO NOTHING`
      : `ON CONFLICT (${keyList}) DO UPDATE SET ` +
        updateCols.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(", ");

  const orderBy = spec.conflict.map(ident).join(", ");

  let read = 0;
  let upserted = 0;
  // Keyset cursor: the last conflict-key tuple we read.
  let cursor: unknown[] | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // WHERE (k1,k2) > ($1,$2) using row-value comparison for a clean keyset.
    const where =
      cursor === null
        ? ""
        : `WHERE (${keyList}) > (${spec.conflict.map((_, i) => `$${i + 1}`).join(", ")})`;
    const params = cursor === null ? [] : cursor;
    const { rows } = await src.query(
      `SELECT ${colList} FROM "${spec.name}" ${where} ORDER BY ${orderBy} LIMIT ${BATCH}`,
      params,
    );
    if (rows.length === 0) break;
    read += rows.length;

    // Build a single multi-row INSERT for the batch.
    const values: unknown[] = [];
    const tuples: string[] = [];
    rows.forEach((row, r) => {
      const ph = cols.map((_, c) => `$${r * cols.length + c + 1}`);
      tuples.push(`(${ph.join(", ")})`);
      cols.forEach((c) => values.push((row as Record<string, unknown>)[c]));
    });
    const insert = `INSERT INTO "${spec.name}" (${colList}) VALUES ${tuples.join(
      ", ",
    )} ${onConflict}`;
    const res = await tgt.query(insert, values);
    upserted += res.rowCount ?? 0;

    const last = rows[rows.length - 1] as Record<string, unknown>;
    cursor = spec.conflict.map((k) => last[k]);
    if (rows.length < BATCH) break;
  }

  return { table: spec.name, read, upserted };
}
