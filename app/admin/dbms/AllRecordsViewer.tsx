'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Table as TableIcon,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Eye,
  Key,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { TableSummary, TableDetail } from '@/lib/db/repositories/database-explorer';

interface Props {
  tables: TableSummary[];
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
  onViewSchema: () => void;
}

export default function AllRecordsViewer({
  tables,
  selectedTable,
  onSelectTable,
  onViewSchema,
}: Props) {
  const [tableSearch, setTableSearch] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [tableData, setTableData] = useState<TableDetail | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Inspector modal state
  const [inspectingRow, setInspectingRow] = useState<Record<string, unknown> | null>(null);

  // Deletion state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRecords = useCallback(
    async (tableName: string, targetPage = 1, colSort?: string, orderSort?: 'ASC' | 'DESC') => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(limit),
        });
        if (colSort) {
          params.set('sortBy', colSort);
          params.set('sortOrder', orderSort ?? 'DESC');
        }

        const res = await fetch(`/api/admin/database/tables/${encodeURIComponent(tableName)}?${params}`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || `Failed to fetch records for ${tableName}`);
        }
        const data = (await res.json()) as TableDetail;
        setTableData(data);
        setPage(data.page);
      } catch (err: any) {
        setError(err.message || 'Error fetching records.');
      } finally {
        setLoading(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    if (selectedTable) {
      setPage(1);
      setSortBy(undefined);
      setPendingDeleteId(null);
      setRecordSearch('');
      fetchRecords(selectedTable, 1);
    }
  }, [selectedTable, fetchRecords]);

  function handleSort(colName: string) {
    let nextOrder: 'ASC' | 'DESC' = 'ASC';
    if (sortBy === colName) {
      nextOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
    }
    setSortBy(colName);
    setSortOrder(nextOrder);
    if (selectedTable) {
      fetchRecords(selectedTable, page, colName, nextOrder);
    }
  }

  async function handleDeleteRecord(recordId: string) {
    if (!selectedTable) return;
    setDeletingId(recordId);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/database/tables/${encodeURIComponent(selectedTable)}/records/${encodeURIComponent(recordId)}`,
        { method: 'DELETE' },
      );
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };

      if (!res.ok) {
        setError(body.error ?? 'Could not delete the record.');
        return;
      }

      setNotice(`Record ${recordId} deleted successfully.`);
      setPendingDeleteId(null);
      fetchRecords(selectedTable, page, sortBy, sortOrder);
    } catch {
      setError('Failed to reach server to delete the record.');
    } finally {
      setDeletingId(null);
    }
  }

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase()),
  );

  // Client-side record search across row values
  const visibleRows = (tableData?.rows ?? []).filter((row) => {
    if (!recordSearch.trim()) return true;
    const query = recordSearch.toLowerCase();
    return Object.values(row).some((val) => {
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(query);
    });
  });

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-start">
      {/* Sidebar: Table Selector */}
      <div className="card p-5 lg:col-span-3">
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-line">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-ink" />
            <h3 className="font-bold text-ink text-sm uppercase tracking-wider">Tables</h3>
          </div>
          <span className="rounded-pill bg-ink/10 px-2.5 py-0.5 text-xs font-semibold text-ink">
            {tables.length}
          </span>
        </div>

        <div className="relative mt-4 mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <input
            type="text"
            placeholder="Filter tables…"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-line bg-paper text-ink placeholder:text-ink-muted focus:outline-none focus:border-ink"
          />
        </div>

        <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
          {filteredTables.map((t) => {
            const isSelected = selectedTable === t.name;
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => onSelectTable(t.name)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-mono transition-colors text-left ${
                  isSelected
                    ? 'bg-ink text-paper-raised font-bold shadow-sm'
                    : 'text-ink hover:bg-paper hover:text-ink'
                }`}
              >
                <span className="truncate pr-2">{t.name}</span>
                <span
                  className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-sans font-semibold ${
                    isSelected ? 'bg-paper-raised/25 text-paper-raised' : 'bg-line/60 text-ink-muted'
                  }`}
                >
                  {t.rowCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: Data Grid */}
      <div className="space-y-4 lg:col-span-9">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-state-error bg-paper px-4 py-3 text-sm text-state-error flex items-start justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-state-error hover:opacity-75">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-lg border border-state-ok bg-paper px-4 py-3 text-sm text-state-ok flex items-start justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
            <button type="button" onClick={() => setNotice(null)} className="text-state-ok hover:opacity-75">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="card p-6 overflow-hidden">
          {/* Header toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="type-display text-xl font-bold font-mono text-ink">
                  {selectedTable ?? 'Select a Table'}
                </h3>
                {tableData?.primaryKey && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                    <Key className="h-3 w-3" />
                    PK: {tableData.primaryKey}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {tableData ? (
                  <>
                    Showing {tableData.rows.length} of {tableData.totalRows.toLocaleString()} rows ·{' '}
                    {tableData.columns.length} columns
                  </>
                ) : (
                  'Select a table from the sidebar to inspect its records.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onViewSchema}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>View Schema</span>
              </button>

              <button
                type="button"
                onClick={() => selectedTable && fetchRecords(selectedTable, page, sortBy, sortOrder)}
                disabled={loading || !selectedTable}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-3.5 py-1.5 text-xs font-medium text-ink hover:border-ink transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Controls: Search in table & Limit selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
              <input
                type="text"
                placeholder="Search values in page…"
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-line bg-paper text-ink placeholder:text-ink-muted focus:outline-none focus:border-ink"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink focus:outline-none focus:border-ink font-semibold"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Data Records Table */}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-ink-muted font-semibold uppercase">
                  <th className="py-3 px-3 text-center w-12">#</th>
                  {tableData?.columns.map((col) => {
                    const isSorted = sortBy === col.name;
                    return (
                      <th
                        key={col.name}
                        onClick={() => handleSort(col.name)}
                        className="py-3 px-3 cursor-pointer hover:bg-line/40 transition-colors select-none font-mono"
                      >
                        <div className="flex items-center gap-1.5">
                          {col.isPrimaryKey && <Key className="h-3 w-3 text-amber-600 shrink-0" />}
                          <span className={col.isPrimaryKey ? 'text-amber-900 font-bold' : 'text-ink'}>
                            {col.name}
                          </span>
                          <span className="text-ink-muted">
                            {isSorted ? (
                              sortOrder === 'ASC' ? (
                                <ArrowUp className="h-3 w-3 text-ink" />
                              ) : (
                                <ArrowDown className="h-3 w-3 text-ink" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-30" />
                            )}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(tableData?.columns.length ?? 0) + 2}
                      className="py-12 text-center text-ink-muted"
                    >
                      {loading ? 'Loading records…' : 'No records found for this query.'}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, idx) => {
                    const pkCol = tableData?.primaryKey || 'id';
                    const pkVal = row[pkCol] !== undefined ? String(row[pkCol]) : null;

                    return (
                      <tr key={idx} className="hover:bg-paper-raised transition-colors">
                        <td className="py-2.5 px-3 text-center text-ink-muted font-mono">
                          {(page - 1) * limit + idx + 1}
                        </td>
                        {tableData?.columns.map((col) => {
                          const val = row[col.name];
                          let formatted: string;
                          let isNull = false;

                          if (val === null || val === undefined) {
                            formatted = 'NULL';
                            isNull = true;
                          } else if (typeof val === 'object') {
                            formatted = JSON.stringify(val);
                          } else {
                            formatted = String(val);
                          }

                          return (
                            <td
                              key={col.name}
                              className={`py-2.5 px-3 font-mono max-w-[240px] truncate ${
                                isNull
                                  ? 'text-ink-muted/50 italic'
                                  : col.isPrimaryKey
                                  ? 'font-semibold text-amber-900'
                                  : 'text-ink'
                              }`}
                              title={formatted}
                            >
                              {formatted}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectingRow(row)}
                              className="inline-flex items-center gap-1 rounded p-1 text-ink-muted hover:bg-line/50 hover:text-ink transition-colors"
                              title="Inspect full row JSON"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>

                            {pkVal && (
                              <>
                                {pendingDeleteId === pkVal ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={deletingId === pkVal}
                                      onClick={() => handleDeleteRecord(pkVal)}
                                      className="rounded bg-state-error px-2 py-0.5 text-[11px] font-semibold text-paper-raised hover:bg-state-error/90 disabled:opacity-50"
                                    >
                                      {deletingId === pkVal ? '…' : 'Confirm'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingDeleteId(null)}
                                      className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted hover:text-ink"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteId(pkVal)}
                                    className="inline-flex items-center gap-1 rounded p-1 text-ink-muted hover:text-state-error hover:bg-state-error/10 transition-colors"
                                    title={`Delete record ${pkVal}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {tableData && tableData.totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line text-xs">
              <span className="text-ink-muted">
                Page <strong className="text-ink">{tableData.page}</strong> of{' '}
                <strong className="text-ink">{tableData.totalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    const prev = Math.max(1, page - 1);
                    setPage(prev);
                    if (selectedTable) fetchRecords(selectedTable, prev, sortBy, sortOrder);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-ink hover:bg-paper disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={page >= tableData.totalPages || loading}
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    if (selectedTable) fetchRecords(selectedTable, next, sortBy, sortOrder);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-ink hover:bg-paper disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row Inspector Modal */}
      {inspectingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden bg-paper-raised p-6 shadow-xl border border-line">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h4 className="type-display text-lg font-bold text-ink flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Record Inspector — <span className="font-mono">{selectedTable}</span>
                </h4>
                <p className="text-xs text-ink-muted">Complete column attributes for this row</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingRow(null)}
                className="rounded-full p-1.5 text-ink-muted hover:bg-line/50 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 font-mono text-xs">
              {Object.entries(inspectingRow).map(([key, val]) => (
                <div key={key} className="rounded-lg border border-line bg-paper p-3">
                  <div className="text-ink-muted text-[11px] font-sans font-semibold mb-1 uppercase tracking-wider">
                    {key}
                  </div>
                  <div className="text-ink break-all select-all">
                    {val === null || val === undefined ? (
                      <span className="italic text-ink-muted">NULL</span>
                    ) : typeof val === 'object' ? (
                      <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(val, null, 2)}
                      </pre>
                    ) : (
                      String(val)
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingRow(null)}
                className="inline-flex min-h-[40px] items-center rounded-pill bg-ink px-6 text-xs font-semibold text-paper-raised hover:bg-ink/85"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
