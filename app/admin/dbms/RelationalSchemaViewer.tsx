'use client';

import { useState } from 'react';
import {
  Database,
  Key,
  Link as LinkIcon,
  Table as TableIcon,
  ArrowRight,
  Search,
  Layers,
  ChevronDown,
  ChevronUp,
  GitFork,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import type { DatabaseRelationalSchema, DetailedTableSchema } from '@/lib/db/repositories/database-explorer';

interface Props {
  schema: DatabaseRelationalSchema;
  onSelectTable: (tableName: string) => void;
}

export default function RelationalSchemaViewer({ schema, onSelectTable }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>(schema.tables[0]?.name ?? null);

  const filteredTables = schema.tables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.columns.some((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  return (
    <div className="space-y-10">
      {/* Top metrics summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <dt className="type-eyebrow text-ink-muted flex items-center gap-2">
            <Database className="h-4 w-4" />
            Database Tables
          </dt>
          <dd className="mt-2 text-3xl font-bold text-ink">{schema.summary.totalTables}</dd>
          <p className="mt-1 text-xs text-ink-muted">Public schema relational tables</p>
        </div>

        <div className="card p-5">
          <dt className="type-eyebrow text-ink-muted flex items-center gap-2">
            <GitFork className="h-4 w-4" />
            Foreign Key Relations
          </dt>
          <dd className="mt-2 text-3xl font-bold text-ink">{schema.summary.totalRelations}</dd>
          <p className="mt-1 text-xs text-ink-muted">Referential integrity constraints</p>
        </div>

        <div className="card p-5">
          <dt className="type-eyebrow text-ink-muted flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Total Stored Records
          </dt>
          <dd className="mt-2 text-3xl font-bold text-ink">{schema.summary.totalRows.toLocaleString()}</dd>
          <p className="mt-1 text-xs text-ink-muted">Across all database entities</p>
        </div>
      </div>

      {/* Relational Entity-Relationship Diagram Visualizer */}
      <div className="card p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div>
            <h3 className="type-display text-xl font-bold text-ink flex items-center gap-2.5">
              <GitFork className="h-5 w-5 text-ink" />
              Relational Entity-Relationship (ER) Graph
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Visualizes how primary keys (PK) and foreign keys (FK) interconnect across tables in the database.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper px-3.5 py-1 text-xs font-semibold text-ink border border-line">
            PostgreSQL Schema
          </span>
        </div>

        {/* Visual ER Map */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schema.tables.map((table) => {
            const hasPk = Boolean(table.primaryKey);
            const outgoingCount = table.outgoingRelations.length;
            const incomingCount = table.incomingRelations.length;

            return (
              <div
                key={table.name}
                className="rounded-xl border border-line bg-paper p-5 transition-all hover:border-ink/30 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/5 text-ink font-semibold text-xs">
                      <TableIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <h4 className="font-bold text-ink text-base">{table.name}</h4>
                      <p className="text-xs text-ink-muted">
                        {table.rowCount} rows · {table.columnCount} cols
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectTable(table.name)}
                    className="inline-flex items-center gap-1 rounded-pill bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink hover:bg-ink hover:text-paper-raised transition-colors"
                    title={`View records for ${table.name}`}
                  >
                    <span>Records</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                {/* Primary Key info */}
                {hasPk && (
                  <div className="mt-3.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <Key className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>PK:</span>
                    <code className="font-mono font-semibold text-ink">{table.primaryKey}</code>
                  </div>
                )}

                {/* Relations indicators */}
                <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-line/60">
                  {outgoingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      <ArrowUpRight className="h-3 w-3" />
                      References: {outgoingCount} {outgoingCount === 1 ? 'table' : 'tables'}
                    </span>
                  ) : null}

                  {incomingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      <ArrowDownLeft className="h-3 w-3" />
                      Referenced by: {incomingCount} {incomingCount === 1 ? 'table' : 'tables'}
                    </span>
                  ) : null}

                  {outgoingCount === 0 && incomingCount === 0 ? (
                    <span className="text-[11px] text-ink-muted">Independent base entity</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Foreign Key Relations List */}
        <div className="mt-8 pt-6 border-t border-line">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-ink-muted mb-4">
            Active Foreign Key Constraints ({schema.relations.length})
          </h4>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {schema.relations.map((rel, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-xs font-mono"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-semibold text-ink">{rel.fromTable}</span>
                  <span className="text-ink-muted">({rel.fromColumn})</span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                  <span className="font-semibold text-blue-600">{rel.toTable}</span>
                  <span className="text-ink-muted">({rel.toColumn})</span>
                </div>
                <span className="shrink-0 text-[10px] text-ink-muted font-sans font-medium px-2 py-0.5 rounded bg-paper border border-line">
                  FK
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Relational Table & Column Dictionary */}
      <div className="card p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
          <div>
            <h3 className="type-display text-xl font-bold text-ink">
              Relational Tables Dictionary
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Inspect columns, data types, nullability, primary keys, and foreign keys per table.
            </p>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
            <input
              type="text"
              placeholder="Filter tables or columns…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-pill border border-line-strong bg-paper text-ink placeholder:text-ink-muted focus:outline-none focus:border-ink"
            />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {filteredTables.map((table) => {
            const isExpanded = expandedTable === table.name;

            return (
              <div
                key={table.name}
                className="rounded-xl border border-line bg-paper-raised overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setExpandedTable(isExpanded ? null : table.name)}
                  className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-paper/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-paper-raised font-bold text-xs">
                      <TableIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-base font-mono">{table.name}</span>
                        {table.primaryKey && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                            <Key className="h-3 w-3" />
                            PK: {table.primaryKey}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {table.rowCount.toLocaleString()} records · {table.columnCount} columns
                        {table.outgoingRelations.length > 0 && ` · references ${table.outgoingRelations.length} foreign tables`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTable(table.name);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-semibold text-paper-raised hover:bg-ink/85 transition-colors"
                    >
                      <span>View Records</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>

                    <span className="text-ink-muted">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-line bg-paper px-4 py-5 sm:px-6">
                    {/* Columns Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-line text-ink-muted uppercase font-semibold">
                            <th className="pb-3 pl-2">Column Name</th>
                            <th className="pb-3">Data Type</th>
                            <th className="pb-3">Nullable</th>
                            <th className="pb-3">Key & Constraint</th>
                            <th className="pb-3">Default Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/60">
                          {table.columns.map((col) => (
                            <tr key={col.name} className="hover:bg-paper-raised/40">
                              <td className="py-2.5 pl-2 font-mono font-semibold text-ink">
                                {col.name}
                              </td>
                              <td className="py-2.5 font-mono text-ink-muted">
                                {col.dataType}
                              </td>
                              <td className="py-2.5">
                                {col.isNullable ? (
                                  <span className="text-ink-muted">Nullable</span>
                                ) : (
                                  <span className="font-medium text-state-run">NOT NULL</span>
                                )}
                              </td>
                              <td className="py-2.5">
                                {col.isPrimaryKey ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-100/70 px-2 py-0.5 font-medium text-amber-800">
                                    <Key className="h-3 w-3" />
                                    PRIMARY KEY
                                  </span>
                                ) : col.foreignKey ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                                    <LinkIcon className="h-3 w-3" />
                                    FK &rarr; {col.foreignKey.toTable}.{col.foreignKey.toColumn}
                                  </span>
                                ) : (
                                  <span className="text-ink-muted">—</span>
                                )}
                              </td>
                              <td className="py-2.5 font-mono text-ink-muted truncate max-w-[200px]">
                                {col.defaultValue ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Connected Relational Links */}
                    {(table.outgoingRelations.length > 0 || table.incomingRelations.length > 0) && (
                      <div className="mt-5 pt-4 border-t border-line/60 grid gap-4 sm:grid-cols-2 text-xs">
                        {table.outgoingRelations.length > 0 && (
                          <div>
                            <span className="font-semibold text-ink flex items-center gap-1.5 mb-2">
                              <ArrowUpRight className="h-3.5 w-3.5 text-blue-600" />
                              Foreign Key References (Outgoing)
                            </span>
                            <ul className="space-y-1.5">
                              {table.outgoingRelations.map((rel, i) => (
                                <li key={i} className="font-mono text-ink-muted flex items-center gap-1.5">
                                  <span>{rel.fromColumn}</span>
                                  <ArrowRight className="h-3 w-3 text-ink-muted" />
                                  <button
                                    type="button"
                                    onClick={() => onSelectTable(rel.toTable)}
                                    className="font-bold text-blue-600 hover:underline"
                                  >
                                    {rel.toTable}.{rel.toColumn}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {table.incomingRelations.length > 0 && (
                          <div>
                            <span className="font-semibold text-ink flex items-center gap-1.5 mb-2">
                              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                              Referenced by Other Tables (Incoming)
                            </span>
                            <ul className="space-y-1.5">
                              {table.incomingRelations.map((rel, i) => (
                                <li key={i} className="font-mono text-ink-muted flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onSelectTable(rel.fromTable)}
                                    className="font-bold text-emerald-700 hover:underline"
                                  >
                                    {rel.fromTable}.{rel.fromColumn}
                                  </button>
                                  <ArrowRight className="h-3 w-3 text-ink-muted" />
                                  <span>{table.name}.{rel.toColumn}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
