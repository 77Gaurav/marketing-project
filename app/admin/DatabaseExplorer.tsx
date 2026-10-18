'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { 
  Database, 
  Table as TableIcon, 
  Trash2, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Key, 
  Columns,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import type { TableSummary, TableDetail, ColumnMeta } from '@/lib/db/repositories/database-explorer';

const NUMBER_FORMAT = new Intl.NumberFormat('en-GB');
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
});

interface Props {
  initialTables?: TableSummary[];
}

export default function DatabaseExplorer({ initialTables }: Props) {
  const [tables, setTables] = useState<TableSummary[]>(initialTables ?? []);
  const [selectedTable, setSelectedTable] = useState<string | null>(initialTables?.[0]?.name ?? null);
  const [tableSearch, setTableSearch] = useState('');
  
  // Current table state
  const [tableData, setTableData] = useState<TableDetail | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  
  // UI states
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  
  // Deletion state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Load all tables
  const fetchTables = useCallback(async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/database/tables');
      if (!res.ok) throw new Error('Failed to load tables');
      const data = (await res.json()) as { tables: TableSummary[] };
      setTables(data.tables);
      if (!selectedTable && data.tables.length > 0) {
        setSelectedTable(data.tables[0].name);
      }
    } catch {
      setError('Could not load database tables. Ensure your admin session is active.');
    } finally {
      setLoadingTables(false);
    }
  }, [selectedTable]);

  // Load records for the selected table
  const fetchTableRecords = useCallback(async (tableName: string, targetPage = 1, currentSortBy?: string, currentSortOrder?: 'ASC' | 'DESC') => {
    setLoadingData(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(limit),
      });
      if (currentSortBy) {
        params.set('sortBy', currentSortBy);
        params.set('sortOrder', currentSortOrder ?? 'DESC');
      }

      const res = await fetch(`/api/admin/database/tables/${encodeURIComponent(tableName)}?${params}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Failed to load records for ${tableName}`);
      }
      const data = (await res.json()) as TableDetail;
      setTableData(data);
      setPage(data.page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch table records.');
    } finally {
      setLoadingData(false);
    }
  }, [limit]);

  useEffect(() => {
    if (tables.length === 0) {
      fetchTables();
    }
  }, [fetchTables, tables.length]);

  useEffect(() => {
    if (selectedTable) {
      setPage(1);
      setSortBy(undefined);
      setPendingDeleteId(null);
      fetchTableRecords(selectedTable, 1);
    }
  }, [selectedTable, fetchTableRecords]);

  // Handle Sort
  function handleSort(colName: string) {
    let nextOrder: 'ASC' | 'DESC' = 'ASC';
    if (sortBy === colName) {
      nextOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
    }
    setSortBy(colName);
    setSortOrder(nextOrder);
    if (selectedTable) {
      fetchTableRecords(selectedTable, page, colName, nextOrder);
    }
  }

  // Handle Record Delete
  async function handleDeleteRecord(recordId: string) {
    if (!selectedTable) return;
    setDeletingId(recordId);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/database/tables/${encodeURIComponent(selectedTable)}/records/${encodeURIComponent(recordId)}`,
        { method: 'DELETE' }
      );
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };

      if (!res.ok) {
        setError(body.error ?? 'Could not delete the record.');
        return;
      }

      // Success: update state
      setNotice(`Record ${recordId} was permanently deleted from "${selectedTable}".`);
      setPendingDeleteId(null);
      
      startTransition(() => {
        // Decrement local table row count
        setTables((prev) =>
          prev.map((t) => (t.name === selectedTable ? { ...t, rowCount: Math.max(0, t.rowCount - 1) } : t))
        );
        // Refresh table records
        fetchTableRecords(selectedTable, page, sortBy, sortOrder);
      });
    } catch {
      setError('Connection failure while attempting to delete the record.');
    } finally {
      setDeletingId(null);
    }
  }

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-state-error/40 bg-state-error/10 p-4 text-[length:var(--type-small)] text-state-error"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{error}</div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-state-error hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-state-ok/40 bg-state-ok/10 p-4 text-[length:var(--type-small)] text-state-ok"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{notice}</div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-state-ok hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Tables List Sidebar + Selected Table Data */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Table Selector Sidebar */}
        <aside className="card p-4 lg:col-span-1">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex items-center gap-2 font-semibold text-ink">
              <Database className="h-4 w-4 text-ink-muted" />
              <span>Public Tables</span>
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink-muted">
                {tables.length}
              </span>
            </div>
            <button
              type="button"
              onClick={fetchTables}
              disabled={loadingTables}
              title="Refresh tables"
              className="rounded p-1 text-ink-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingTables ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Table Search */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
            <input
              type="text"
              placeholder="Filter tables..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full rounded-md border border-line bg-paper-raised py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-ink-muted focus:border-ink/50 focus:outline-none"
            />
          </div>

          {/* Tables List */}
          <ul className="mt-3 max-h-[34rem] space-y-1 overflow-y-auto pr-1">
            {filteredTables.length === 0 ? (
              <li className="p-3 text-center text-xs text-ink-muted">No tables found.</li>
            ) : (
              filteredTables.map((t) => {
                const isSelected = selectedTable === t.name;
                return (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => setSelectedTable(t.name)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-ink font-semibold text-paper-raised'
                          : 'text-ink hover:bg-paper-raised'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <TableIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-paper-raised' : 'text-ink-muted'}`} />
                        <span className="truncate">{t.name}</span>
                      </div>
                      <span
                        className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                          isSelected ? 'bg-paper/20 text-paper-raised' : 'bg-paper text-ink-muted'
                        }`}
                      >
                        {NUMBER_FORMAT.format(t.rowCount)}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* Selected Table Content */}
        <section className="space-y-4 lg:col-span-3">
          {selectedTable && (
            <div className="card overflow-hidden">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-paper px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-ink p-2 text-paper-raised">
                    <TableIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      {selectedTable}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      {tableData ? NUMBER_FORMAT.format(tableData.totalRows) : '—'} records ·{' '}
                      {tableData?.columns.length ?? '—'} columns
                      {tableData?.primaryKey && (
                        <span className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] text-ink">
                          <Key className="h-3 w-3 text-state-ok" />
                          PK: {tableData.primaryKey}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSchema(!showSchema)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink/25"
                  >
                    <Columns className="h-3.5 w-3.5 text-ink-muted" />
                    {showSchema ? 'Hide Schema' : 'View Schema'}
                  </button>

                  <button
                    type="button"
                    onClick={() => selectedTable && fetchTableRecords(selectedTable, page, sortBy, sortOrder)}
                    disabled={loadingData}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink/25 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-ink-muted ${loadingData ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Schema Inspector Drawer */}
              {showSchema && tableData && (
                <div className="border-b border-line bg-paper/60 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Table Columns & Types
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {tableData.columns.map((col: ColumnMeta) => (
                      <div
                        key={col.name}
                        className="rounded border border-line bg-paper-raised p-2 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono font-medium text-ink">
                          <span className="truncate">{col.name}</span>
                          {col.isPrimaryKey && (
                            <span className="shrink-0 rounded bg-state-ok/10 px-1 text-[10px] font-bold text-state-ok">
                              PK
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
                          <span>{col.dataType}</span>
                          <span>{col.isNullable ? 'nullable' : 'required'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className="relative min-h-[22rem] overflow-x-auto">
                {loadingData && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/60 backdrop-blur-xs">
                    <div className="flex items-center gap-2 rounded-full border border-line bg-paper-raised px-4 py-2 text-xs font-medium text-ink shadow-sm">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Loading records...
                    </div>
                  </div>
                )}

                {tableData && tableData.rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-sm text-ink-muted">
                    <TableIcon className="mb-2 h-8 w-8 opacity-40" />
                    <span>No records present in table &ldquo;{selectedTable}&rdquo;.</span>
                  </div>
                ) : tableData ? (
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-line bg-paper/50">
                        {/* Action column */}
                        <th className="sticky left-0 z-1 bg-paper/90 px-4 py-3 font-semibold uppercase tracking-wider text-ink-muted shadow-r">
                          Action
                        </th>
                        {tableData.columns.map((col) => {
                          const isSorted = sortBy === col.name;
                          return (
                            <th
                              key={col.name}
                              onClick={() => handleSort(col.name)}
                              className="cursor-pointer whitespace-nowrap px-4 py-3 font-semibold text-ink-muted transition-colors hover:text-ink"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={col.isPrimaryKey ? 'font-bold text-ink' : ''}>
                                  {col.name}
                                </span>
                                {isSorted ? (
                                  sortOrder === 'ASC' ? (
                                    <ArrowUp className="h-3 w-3 text-ink" />
                                  ) : (
                                    <ArrowDown className="h-3 w-3 text-ink" />
                                  )
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 opacity-30" />
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {tableData.rows.map((row, idx) => {
                        const pkVal = tableData.primaryKey
                          ? String(row[tableData.primaryKey] ?? '')
                          : String(row.id ?? idx);
                        const isPendingDelete = pendingDeleteId === pkVal;
                        const isDeleting = deletingId === pkVal;

                        return (
                          <tr key={pkVal || idx} className="transition-colors hover:bg-paper-raised">
                            {/* Action Delete Button */}
                            <td className="sticky left-0 z-1 whitespace-nowrap bg-paper/90 px-4 py-2.5 shadow-r">
                              {isPendingDelete ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRecord(pkVal)}
                                    disabled={isDeleting}
                                    className="rounded bg-state-error px-2 py-1 text-[11px] font-semibold text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-50"
                                  >
                                    {isDeleting ? 'Deleting...' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteId(null)}
                                    disabled={isDeleting}
                                    className="rounded border border-line px-2 py-1 text-[11px] text-ink-muted hover:text-ink"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteId(pkVal)}
                                  title={`Delete row ${pkVal}`}
                                  className="inline-flex items-center gap-1 rounded border border-line-strong px-2 py-1 text-[11px] font-medium text-state-error transition-colors hover:border-state-error hover:bg-state-error/5"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              )}
                            </td>

                            {/* Column values */}
                            {tableData.columns.map((col) => {
                              const val = row[col.name];
                              return (
                                <td
                                  key={col.name}
                                  className="max-w-[20rem] truncate px-4 py-2.5 align-middle font-mono text-[11px] text-ink"
                                >
                                  <CellDisplay value={val} type={col.dataType} isPk={col.isPrimaryKey} />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : null}
              </div>

              {/* Pagination Controls */}
              {tableData && tableData.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-paper px-6 py-3 text-xs text-ink-muted">
                  <div className="flex items-center gap-3">
                    <span>
                      Showing{' '}
                      <strong className="text-ink">
                        {(tableData.page - 1) * tableData.limit + 1}
                      </strong>{' '}
                      to{' '}
                      <strong className="text-ink">
                        {Math.min(tableData.page * tableData.limit, tableData.totalRows)}
                      </strong>{' '}
                      of <strong className="text-ink">{NUMBER_FORMAT.format(tableData.totalRows)}</strong> records
                    </span>

                    <label className="flex items-center gap-1.5">
                      <span>Rows per page:</span>
                      <select
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className="rounded border border-line bg-paper-raised px-2 py-1 text-xs text-ink focus:outline-none"
                      >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchTableRecords(selectedTable, page - 1, sortBy, sortOrder)}
                      disabled={page <= 1 || loadingData}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-pill border border-line px-3 font-medium text-ink transition-colors hover:border-ink/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </button>

                    <span className="px-2 font-medium text-ink">
                      Page {tableData.page} of {tableData.totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => fetchTableRecords(selectedTable, page + 1, sortBy, sortOrder)}
                      disabled={page >= tableData.totalPages || loadingData}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-pill border border-line px-3 font-medium text-ink transition-colors hover:border-ink/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Format cell values depending on data type and content.
 */
function CellDisplay({ value, isPk }: { value: unknown; type: string; isPk: boolean }) {
  if (value === null || value === undefined) {
    return <span className="font-sans italic text-ink-muted/60">null</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          value ? 'bg-state-ok/10 text-state-ok' : 'bg-paper text-ink-muted'
        }`}
      >
        {value ? 'true' : 'false'}
      </span>
    );
  }

  if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value))) {
    const d = new Date(value as string | Date);
    if (!isNaN(d.getTime())) {
      return (
        <span title={d.toISOString()} className="text-ink">
          {DATE_FORMAT.format(d)}
        </span>
      );
    }
  }

  if (typeof value === 'object') {
    return (
      <span className="truncate text-ink-muted" title={JSON.stringify(value)}>
        {JSON.stringify(value)}
      </span>
    );
  }

  const str = String(value);

  if (isPk) {
    return <span className="font-bold text-ink">{str}</span>;
  }

  return <span className="text-ink">{str}</span>;
}
