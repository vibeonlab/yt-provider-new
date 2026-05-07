import type { Pool, PoolClient } from "pg";

/**
 * 直连 Postgres 的「supabase-js 兼容」客户端。
 *
 * 仅实现仓库内 `agentStore / schedulerStore / adminAuth / operationLogs / health`
 * 真正用到的方法子集：
 *   - .from(table) → builder
 *   - select(cols, { count, head }) / insert(row|rows) / upsert(rows, { onConflict })
 *     / update(data) / delete()
 *   - 过滤：eq / neq / lt / lte / gt / gte / in
 *   - 修饰：order(col, { ascending }) / limit(n) / single()
 *   - 在 mutation 后再 .select(cols) 取 RETURNING 结果
 *
 * 不实现：rpc / 储存过程 / range / textSearch / 复杂过滤等。
 *
 * 错误形态对齐 supabase-js：{ message, details, hint, code }；data 为
 * null（mutation 未跟 select 时）或 row 数组。
 *
 * 设计思路：
 * - 每条链构造一个 `Builder` 对象，await 时（thenable）才执行 SQL，避免提前执行。
 * - 内部把链上累积的过滤/排序/限制翻译成参数化 SQL。
 * - 已知 jsonb 列在写入时显式 ::jsonb 转换，避免 pg 把对象当成 text 报错。
 */

export type PgError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

export type PgResult<T = Record<string, unknown>> = {
  data: T[] | T | null;
  error: PgError | null;
  count?: number | null;
};

type Filter =
  | { op: "="; col: string; val: unknown }
  | { op: "!="; col: string; val: unknown }
  | { op: "<"; col: string; val: unknown }
  | { op: "<="; col: string; val: unknown }
  | { op: ">"; col: string; val: unknown }
  | { op: ">="; col: string; val: unknown }
  | { op: "in"; col: string; val: unknown[] };

type OrderBy = { col: string; ascending: boolean };

/** 已知 jsonb 列：写入 / 更新时需要做 JSON 序列化并 ::jsonb 转换。 */
const JSONB_COLUMNS: Record<string, ReadonlySet<string>> = {
  commands: new Set(["payload"]),
  operation_logs: new Set(["meta"]),
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toPgError(err: unknown): PgError {
  const e = err as {
    message?: string;
    detail?: string;
    hint?: string;
    code?: string;
  };
  return {
    message: e?.message || "unknown postgres error",
    details: e?.detail,
    hint: e?.hint,
    code: e?.code,
  };
}

class PgBuilder<T = Record<string, unknown>>
  implements PromiseLike<PgResult<T>>
{
  private mode: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private columns: string = "*";
  private rows: Record<string, unknown>[] = [];
  private updateData?: Record<string, unknown>;
  private onConflict?: string;
  private filters: Filter[] = [];
  private orderBy: OrderBy[] = [];
  private limitN?: number;
  private countMode?: "exact";
  private headOnly = false;
  private returnSelect = false;
  private returnColumns = "*";
  private singleMode: "one" | "maybe" | null = null;

  constructor(
    private pool: Pool,
    private table: string,
  ) {}

  select(
    cols?: string,
    opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    if (this.mode === "select") {
      this.columns = cols && cols.length > 0 ? cols : "*";
      this.countMode = opts?.count === "exact" ? "exact" : undefined;
      this.headOnly = !!opts?.head;
    } else {
      this.returnSelect = true;
      this.returnColumns = cols && cols.length > 0 ? cols : "*";
    }
    return this;
  }

  insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = "insert";
    this.rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    return this;
  }

  upsert(
    rowOrRows: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string },
  ): this {
    this.mode = "upsert";
    this.rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    this.onConflict = opts?.onConflict;
    return this;
  }

  update(data: Record<string, unknown>): this {
    this.mode = "update";
    this.updateData = data;
    return this;
  }

  delete(): this {
    this.mode = "delete";
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ op: "=", col, val });
    return this;
  }

  neq(col: string, val: unknown): this {
    this.filters.push({ op: "!=", col, val });
    return this;
  }

  lt(col: string, val: unknown): this {
    this.filters.push({ op: "<", col, val });
    return this;
  }

  lte(col: string, val: unknown): this {
    this.filters.push({ op: "<=", col, val });
    return this;
  }

  gt(col: string, val: unknown): this {
    this.filters.push({ op: ">", col, val });
    return this;
  }

  gte(col: string, val: unknown): this {
    this.filters.push({ op: ">=", col, val });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this.filters.push({ op: "in", col, val: vals });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  single(): this {
    this.singleMode = "one";
    this.limitN = 1;
    return this;
  }

  maybeSingle(): this {
    this.singleMode = "maybe";
    this.limitN = 1;
    return this;
  }

  then<TR1 = PgResult<T>, TR2 = never>(
    onfulfilled?:
      | ((value: PgResult<T>) => TR1 | PromiseLike<TR1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TR2 | PromiseLike<TR2>)
      | null
      | undefined,
  ): PromiseLike<TR1 | TR2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TR2 = never>(
    onrejected?:
      | ((reason: unknown) => TR2 | PromiseLike<TR2>)
      | null
      | undefined,
  ): PromiseLike<PgResult<T> | TR2> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<PgResult<T>> {
    return this.execute().finally(onfinally ?? undefined);
  }

  /** 把过滤器编译成 SQL 片段；占位符从 startIndex 开始递增。 */
  private compileWhere(startIndex: number): {
    sql: string;
    values: unknown[];
    nextIndex: number;
  } {
    const values: unknown[] = [];
    let i = startIndex;
    const parts = this.filters.map((f) => {
      if (f.op === "in") {
        const arr = (f.val as unknown[]) || [];
        if (arr.length === 0) {
          return "FALSE";
        }
        values.push(arr);
        return `"${f.col}" = ANY($${i++})`;
      }
      values.push(f.val);
      return `"${f.col}" ${f.op} $${i++}`;
    });
    const sql = parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
    return { sql, values, nextIndex: i };
  }

  private compileOrderLimit(): string {
    let sql = "";
    if (this.orderBy.length > 0) {
      sql += ` ORDER BY ${this.orderBy
        .map(
          (o) => `"${o.col}" ${o.ascending ? "ASC" : "DESC"} NULLS LAST`,
        )
        .join(", ")}`;
    }
    if (typeof this.limitN === "number") {
      sql += ` LIMIT ${Math.max(0, Math.floor(this.limitN))}`;
    }
    return sql;
  }

  /** 把行的某列值按需转换：jsonb 列做 JSON.stringify。 */
  private valueForColumn(table: string, col: string, val: unknown): unknown {
    const jsonb = JSONB_COLUMNS[table];
    if (jsonb && jsonb.has(col)) {
      if (val === null || val === undefined) return null;
      return JSON.stringify(val);
    }
    return val;
  }

  /** 给参数占位符按需附加 ::jsonb 类型转换。 */
  private placeholderForColumn(table: string, col: string, idx: number): string {
    const jsonb = JSONB_COLUMNS[table];
    if (jsonb && jsonb.has(col)) return `$${idx}::jsonb`;
    return `$${idx}`;
  }

  private async execute(): Promise<PgResult<T>> {
    try {
      const pool = this.pool;
      const client: PoolClient = await pool.connect();
      try {
        if (this.mode === "select") {
          if (this.countMode === "exact") {
            const { sql: whereSql, values: whereVals } =
              this.compileWhere(1);
            const sql = `SELECT count(*)::int AS count FROM "${this.table}"${whereSql}`;
            const r = await client.query(sql, whereVals);
            const count = (r.rows[0]?.count as number) ?? 0;
            if (this.headOnly) {
              return {
                data: null,
                error: null,
                count,
              };
            }
            const dataSql = `SELECT ${this.columns} FROM "${this.table}"${whereSql}${this.compileOrderLimit()}`;
            const r2 = await client.query(dataSql, whereVals);
            const rows = r2.rows as T[];
            return {
              data: this.applySingle<T>(rows),
              error: null,
              count,
            };
          }
          const { sql: whereSql, values: whereVals } = this.compileWhere(1);
          const sql = `SELECT ${this.columns} FROM "${this.table}"${whereSql}${this.compileOrderLimit()}`;
          const r = await client.query(sql, whereVals);
          const rows = r.rows as T[];
          return {
            data: this.applySingle<T>(rows),
            error: null,
          };
        }

        if (this.mode === "insert") {
          if (this.rows.length === 0) {
            return { data: null, error: null };
          }
          const { sql, values } = this.buildInsertSql(this.rows, false);
          const r = await client.query(sql, values);
          if (this.returnSelect) {
            const rows = r.rows as T[];
            return { data: this.applySingle<T>(rows), error: null };
          }
          return { data: null, error: null };
        }

        if (this.mode === "upsert") {
          if (this.rows.length === 0) {
            return { data: null, error: null };
          }
          const { sql, values } = this.buildInsertSql(this.rows, true);
          const r = await client.query(sql, values);
          if (this.returnSelect) {
            const rows = r.rows as T[];
            return { data: this.applySingle<T>(rows), error: null };
          }
          return { data: null, error: null };
        }

        if (this.mode === "update") {
          const data = this.updateData || {};
          const cols = Object.keys(data);
          if (cols.length === 0) {
            return { data: null, error: null };
          }
          let pIdx = 1;
          const setParts = cols.map((c) => {
            const ph = this.placeholderForColumn(this.table, c, pIdx);
            pIdx += 1;
            return `"${c}" = ${ph}`;
          });
          const setValues = cols.map((c) =>
            this.valueForColumn(this.table, c, data[c]),
          );

          const { sql: whereSql, values: whereVals } =
            this.compileWhere(pIdx);
          const sql = `UPDATE "${this.table}" SET ${setParts.join(", ")}${whereSql}${
            this.returnSelect ? ` RETURNING ${this.returnColumns}` : ""
          }${this.compileOrderLimit()}`;
          const r = await client.query(sql, [...setValues, ...whereVals]);
          if (this.returnSelect) {
            const rows = r.rows as T[];
            return { data: this.applySingle<T>(rows), error: null };
          }
          return { data: null, error: null };
        }

        if (this.mode === "delete") {
          const { sql: whereSql, values: whereVals } = this.compileWhere(1);
          const sql = `DELETE FROM "${this.table}"${whereSql}${
            this.returnSelect ? ` RETURNING ${this.returnColumns}` : ""
          }`;
          const r = await client.query(sql, whereVals);
          if (this.returnSelect) {
            const rows = r.rows as T[];
            return { data: this.applySingle<T>(rows), error: null };
          }
          return { data: null, error: null };
        }

        return { data: null, error: null };
      } finally {
        client.release();
      }
    } catch (err) {
      return { data: null, error: toPgError(err) };
    }
  }

  /** insert / upsert 共用 SQL 构造（占位符 + ON CONFLICT）。 */
  private buildInsertSql(
    rows: Record<string, unknown>[],
    upsert: boolean,
  ): { sql: string; values: unknown[] } {
    const colSet = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
    const cols = [...colSet];
    const values: unknown[] = [];
    let pIdx = 1;
    const valuesSql = rows
      .map((r) => {
        const phs = cols.map((c) => {
          const ph = this.placeholderForColumn(this.table, c, pIdx);
          pIdx += 1;
          values.push(this.valueForColumn(this.table, c, r[c] ?? null));
          return ph;
        });
        return `(${phs.join(", ")})`;
      })
      .join(", ");

    const colSqlList = cols.map((c) => `"${c}"`).join(", ");
    let sql = `INSERT INTO "${this.table}" (${colSqlList}) VALUES ${valuesSql}`;

    if (upsert) {
      const conflictCols = (this.onConflict || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (conflictCols.length === 0) {
        // 没指定冲突列，行为接近 INSERT — 不主动 NOTHING，让 PG 报错（与 supabase-js 一致）
      } else {
        const updateAssignments = cols
          .filter((c) => !conflictCols.includes(c))
          .map((c) => `"${c}" = EXCLUDED."${c}"`);
        sql += ` ON CONFLICT (${conflictCols.map((c) => `"${c}"`).join(", ")})`;
        if (updateAssignments.length === 0) {
          sql += " DO NOTHING";
        } else {
          sql += ` DO UPDATE SET ${updateAssignments.join(", ")}`;
        }
      }
    }

    if (this.returnSelect) {
      sql += ` RETURNING ${this.returnColumns}`;
    }
    return { sql, values };
  }

  private applySingle<R>(rows: R[]): R[] | R | null {
    if (this.singleMode === "one") {
      if (rows.length === 0) {
        return null;
      }
      return rows[0]!;
    }
    if (this.singleMode === "maybe") {
      return rows[0] ?? null;
    }
    return rows;
  }
}

export class PgSupabaseShim {
  constructor(private pool: Pool) {}

  from<T = Record<string, unknown>>(table: string): PgBuilder<T> {
    return new PgBuilder<T>(this.pool, table);
  }
}

/** 兼容 isPlainObject 在外部测试调用，避免被 unused 标记。 */
export const __internals = { isPlainObject };
