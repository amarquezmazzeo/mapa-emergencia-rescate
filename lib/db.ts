import { createRequire } from "module";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export function hasDbEnv(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Detecta una conexión a un Postgres local (desarrollo). */
function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Adaptador para desarrollo local: el driver HTTP de Neon (`neon()`) habla con
 * el endpoint SQL-sobre-HTTP de Neon, así que no puede conectarse a un Postgres
 * local plano. Cuando `DATABASE_URL` apunta a localhost usamos `node-postgres`
 * por TCP, exponiendo la misma interfaz de template tag que usa el resto del
 * código (`sql\`...\``) y devolviendo el array de filas, igual que Neon con
 * `fullResults: false`. `pg` solo se carga en este caso (es devDependency y
 * está en `serverExternalPackages`), por lo que producción no se ve afectada.
 */
function createLocalSql(url: string): NeonQueryFunction<false, false> {
  const require = createRequire(import.meta.url);
  const { Pool, types } = require("pg") as typeof import("pg");
  // BIGINT (oid 20) llega como string por defecto; Neon lo entrega como número.
  // created_at/resolved_at son epoch-ms, dentro del rango seguro de Number.
  types.setTypeParser(20, (v: string) => parseInt(v, 10));
  const pool = new Pool({ connectionString: url });

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`;
    return pool.query(text, values as unknown[]).then((res) => res.rows);
  };

  // Paridad con el driver de Neon: `sql.query(text, params)` ejecuta una
  // consulta parametrizada con placeholders $1..$n y devuelve las filas.
  (sql as { query?: unknown }).query = (text: string, params: unknown[] = []) =>
    pool.query(text, params).then((res) => res.rows);

  return sql as unknown as NeonQueryFunction<false, false>;
}

let _sql: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL!;
    _sql = isLocalUrl(url) ? createLocalSql(url) : neon(url);
  }
  return _sql;
}
