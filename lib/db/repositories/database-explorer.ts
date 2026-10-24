import type { Executor } from '@/lib/db/pool';

/**
 * Repository for the in-app Database Explorer.
 *
 * Provides schema reflection, dynamic table browsing, paginated data inspection,
 * and secure primary-key record deletion for authorized administrators.
 */

export interface TableSummary {
  name: string;
  rowCount: number;
  columnCount: number;
}

export interface ColumnMeta {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface TableDetail {
  name: string;
  columns: ColumnMeta[];
  primaryKey: string | null;
  totalRows: number;
  page: number;
  limit: number;
  totalPages: number;
  rows: Record<string, unknown>[];
}

export interface DeleteRecordResult {
  success: boolean;
  table: string;
  id: string;
  deletedRow?: Record<string, unknown>;
  error?: string;
}

/**
 * Fetch all user-defined base tables in the public schema.
 * Rejects any non-standard names to prevent injection.
 */
export async function listAllTables(db: Executor): Promise<TableSummary[]> {
  const result = await db.query<{
    table_name: string;
    column_count: number;
  }>(
    `SELECT 
       t.table_name,
       (
         SELECT count(*)::int 
         FROM information_schema.columns c 
         WHERE c.table_schema = 'public' AND c.table_name = t.table_name
       ) AS column_count
     FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_name ASC;`,
  );

  // Read exact count for each public table
  const summaries: TableSummary[] = [];

  for (const row of result.rows) {
    const tableName = row.table_name;
    // Strictly validate table identifier
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) continue;

    try {
      const countRes = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "${tableName}"`,
      );
      summaries.push({
        name: tableName,
        rowCount: countRes.rows[0]?.count ?? 0,
        columnCount: row.column_count,
      });
    } catch {
      summaries.push({
        name: tableName,
        rowCount: 0,
        columnCount: row.column_count,
      });
    }
  }

  return summaries;
}

/**
 * Verify that a table name exists in the public schema.
 */
export async function isValidPublicTable(db: Executor, tableName: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return false;

  const result = await db.query(
    `SELECT 1 FROM information_schema.tables 
     WHERE table_schema = 'public' 
       AND table_type = 'BASE TABLE' 
       AND table_name = $1
     LIMIT 1;`,
    [tableName],
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Retrieve column specifications and identify the primary key.
 */
export async function getTableColumns(
  db: Executor,
  tableName: string,
): Promise<{ columns: ColumnMeta[]; primaryKey: string | null }> {
  const result = await db.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    is_pk: boolean | null;
  }>(
    `SELECT 
       c.column_name,
       c.data_type,
       c.is_nullable,
       c.column_default,
       COALESCE(pk.is_pk, false) AS is_pk
     FROM information_schema.columns c
     LEFT JOIN (
       SELECT kcu.column_name, true AS is_pk
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = 'public'
         AND tc.table_name = $1
     ) pk ON pk.column_name = c.column_name
     WHERE c.table_schema = 'public'
       AND c.table_name = $1
     ORDER BY c.ordinal_position ASC;`,
    [tableName],
  );

  const columns: ColumnMeta[] = result.rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    isNullable: row.is_nullable === 'YES',
    defaultValue: row.column_default,
    isPrimaryKey: Boolean(row.is_pk),
  }));

  const pkCol = columns.find((c) => c.isPrimaryKey)?.name ?? null;

  return { columns, primaryKey: pkCol };
}

export interface GetTableRecordsOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
}

/**
 * Read paginated rows from a table, safely validating table and sort columns.
 */
export async function getTableRecords(
  db: Executor,
  tableName: string,
  options: GetTableRecordsOptions = {},
): Promise<TableDetail | null> {
  const isValid = await isValidPublicTable(db, tableName);
  if (!isValid) return null;

  const { columns, primaryKey } = await getTableColumns(db, tableName);
  const columnNames = new Set(columns.map((c) => c.name));

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const offset = (page - 1) * limit;

  // Validate sort column or fallback to primary key or first column
  let sortColumn = options.sortBy && columnNames.has(options.sortBy) ? options.sortBy : null;
  if (!sortColumn) {
    if (primaryKey) {
      sortColumn = primaryKey;
    } else if (columnNames.has('created_at')) {
      sortColumn = 'created_at';
    } else if (columns.length > 0) {
      sortColumn = columns[0].name;
    }
  }

  const sortOrder = options.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Total count
  const countRes = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM "${tableName}"`,
  );
  const totalRows = countRes.rows[0]?.count ?? 0;
  const totalPages = Math.ceil(totalRows / limit) || 1;

  // Rows query
  const orderClause = sortColumn ? `ORDER BY "${sortColumn}" ${sortOrder}` : '';
  const rowsRes = await db.query<Record<string, unknown>>(
    `SELECT * FROM "${tableName}" ${orderClause} LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    name: tableName,
    columns,
    primaryKey,
    totalRows,
    page,
    limit,
    totalPages,
    rows: rowsRes.rows,
  };
}

/**
 * Delete a single record from a table by its primary key.
 */
export async function deleteRecordByPrimaryKey(
  db: Executor,
  tableName: string,
  recordId: string,
): Promise<DeleteRecordResult> {
  const isValid = await isValidPublicTable(db, tableName);
  if (!isValid) {
    return {
      success: false,
      table: tableName,
      id: recordId,
      error: `Table "${tableName}" is not a valid table in the public schema.`,
    };
  }

  const { columns, primaryKey } = await getTableColumns(db, tableName);
  const pk = primaryKey || (columns.some((c) => c.name === 'id') ? 'id' : null);

  if (!pk) {
    return {
      success: false,
      table: tableName,
      id: recordId,
      error: `Cannot delete from "${tableName}": no primary key or 'id' column found.`,
    };
  }

  try {
    const result = await db.query<Record<string, unknown>>(
      `DELETE FROM "${tableName}" WHERE "${pk}" = $1 RETURNING *`,
      [recordId],
    );

    if (result.rowCount === 0) {
      return {
        success: false,
        table: tableName,
        id: recordId,
        error: `Record not found or already deleted.`,
      };
    }

    return {
      success: true,
      table: tableName,
      id: recordId,
      deletedRow: result.rows[0],
    };
  } catch (error: unknown) {
    // Foreign key violation error code in PostgreSQL is 23503
    const pgErr = error as { code?: string; detail?: string; message?: string };
    if (pgErr.code === '23503') {
      return {
        success: false,
        table: tableName,
        id: recordId,
        error: `Cannot delete this record because other records depend on it: ${pgErr.detail || 'Foreign key constraint violation.'}`,
      };
    }

    return {
      success: false,
      table: tableName,
      id: recordId,
      error: pgErr.message || 'Failed to delete record due to a database constraint.',
    };
  }
}

export interface ForeignKeyRelation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  constraintName: string;
}

export interface DetailedTableSchema {
  name: string;
  rowCount: number;
  columnCount: number;
  primaryKey: string | null;
  columns: (ColumnMeta & {
    foreignKey?: {
      toTable: string;
      toColumn: string;
      constraintName: string;
    };
  })[];
  outgoingRelations: {
    fromColumn: string;
    toTable: string;
    toColumn: string;
    constraintName: string;
  }[];
  incomingRelations: {
    fromTable: string;
    fromColumn: string;
    toColumn: string;
    constraintName: string;
  }[];
}

export interface DatabaseRelationalSchema {
  tables: DetailedTableSchema[];
  relations: ForeignKeyRelation[];
  summary: {
    totalTables: number;
    totalRows: number;
    totalRelations: number;
  };
}

/**
 * Fetch all foreign key relationships defined across public tables.
 */
export async function getDatabaseRelationships(db: Executor): Promise<ForeignKeyRelation[]> {
  const result = await db.query<ForeignKeyRelation>(`
    SELECT
      tc.table_name AS "fromTable",
      kcu.column_name AS "fromColumn",
      ccu.table_name AS "toTable",
      ccu.column_name AS "toColumn",
      tc.constraint_name AS "constraintName"
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name;
  `);

  return result.rows;
}

/**
 * Build the full relational schema model with tables, columns, constraints and connected relationships.
 */
export async function getDatabaseRelationalSchema(db: Executor): Promise<DatabaseRelationalSchema> {
  const tableSummaries = await listAllTables(db);
  const relations = await getDatabaseRelationships(db);

  const tables: DetailedTableSchema[] = [];
  let totalRows = 0;

  for (const summary of tableSummaries) {
    totalRows += summary.rowCount;
    const { columns, primaryKey } = await getTableColumns(db, summary.name);

    // Map outgoing relations (this table references another)
    const outgoing = relations.filter((r) => r.fromTable === summary.name);
    // Map incoming relations (other tables reference this table)
    const incoming = relations.filter((r) => r.toTable === summary.name);

    const detailedColumns = columns.map((col) => {
      const fk = outgoing.find((r) => r.fromColumn === col.name);
      return {
        ...col,
        foreignKey: fk
          ? {
              toTable: fk.toTable,
              toColumn: fk.toColumn,
              constraintName: fk.constraintName,
            }
          : undefined,
      };
    });

    tables.push({
      name: summary.name,
      rowCount: summary.rowCount,
      columnCount: summary.columnCount,
      primaryKey,
      columns: detailedColumns,
      outgoingRelations: outgoing.map((r) => ({
        fromColumn: r.fromColumn,
        toTable: r.toTable,
        toColumn: r.toColumn,
        constraintName: r.constraintName,
      })),
      incomingRelations: incoming.map((r) => ({
        fromTable: r.fromTable,
        fromColumn: r.fromColumn,
        toColumn: r.toColumn,
        constraintName: r.constraintName,
      })),
    });
  }

  return {
    tables,
    relations,
    summary: {
      totalTables: tables.length,
      totalRows,
      totalRelations: relations.length,
    },
  };
}

