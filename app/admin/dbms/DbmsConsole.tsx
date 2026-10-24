'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Database,
  GitFork,
  Table as TableIcon,
  Lock,
  ArrowLeft,
  RefreshCw,
  Radio,
  Server,
  Layers,
  CheckCircle,
} from 'lucide-react';
import DbmsAuthForm from './DbmsAuthForm';
import RelationalSchemaViewer from './RelationalSchemaViewer';
import AllRecordsViewer from './AllRecordsViewer';
import type { DatabaseRelationalSchema, TableSummary } from '@/lib/db/repositories/database-explorer';

interface Props {
  initialAuthenticated: boolean;
  initialUser?: string;
  initialSchema?: DatabaseRelationalSchema | null;
}

export default function DbmsConsole({
  initialAuthenticated,
  initialUser,
  initialSchema,
}: Props) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [dbUser, setDbUser] = useState<string | undefined>(initialUser);
  const [activeTab, setActiveTab] = useState<'schema' | 'records'>('schema');
  const [schema, setSchema] = useState<DatabaseRelationalSchema | null>(initialSchema ?? null);
  const [selectedTable, setSelectedTable] = useState<string | null>(
    initialSchema?.tables[0]?.name ?? null,
  );
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load schema once authenticated
  async function loadSchema() {
    setLoadingSchema(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dbms/schema');
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          return;
        }
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Failed to fetch database schema.');
      }
      const data = (await res.json()) as { schema: DatabaseRelationalSchema };
      setSchema(data.schema);
      if (!selectedTable && data.schema.tables.length > 0) {
        setSelectedTable(data.schema.tables[0].name);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load schema.');
    } finally {
      setLoadingSchema(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated && !schema) {
      loadSchema();
    }
  }, [isAuthenticated, schema]);

  async function handleLock() {
    await fetch('/api/admin/dbms/auth', { method: 'DELETE' });
    setIsAuthenticated(false);
    setSchema(null);
  }

  // If not authenticated, render the DB admin credential gate
  if (!isAuthenticated) {
    return (
      <div className="py-6 sm:py-12">
        <div className="mb-8 text-center">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Admin Console</span>
          </Link>
        </div>

        <DbmsAuthForm
          onSuccess={(user) => {
            setIsAuthenticated(true);
            setDbUser(user);
          }}
        />
      </div>
    );
  }

  const tableSummaries: TableSummary[] = (schema?.tables ?? []).map((t) => ({
    name: t.name,
    rowCount: t.rowCount,
    columnCount: t.columnCount,
  }));

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-ink-muted mb-2">
            <Link href="/admin" className="hover:text-ink transition-colors">
              Admin
            </Link>
            <span>/</span>
            <span className="text-ink font-semibold">DBMS & Schema</span>
          </div>

          <h1 className="type-display text-3xl font-bold text-ink flex items-center gap-3">
            <span>Database Management System</span>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-state-ok/15 px-3 py-1 text-xs font-semibold text-state-ok">
              <CheckCircle className="h-3.5 w-3.5" />
              Connected
            </span>
          </h1>

          <p className="mt-2 text-sm text-ink-muted">
            Live relational schema, referential integrity graph, and record inspector for{' '}
            <code className="font-semibold text-ink">string_theory</code>. Signed in as{' '}
            <strong className="text-ink font-mono">{dbUser || 'DB Administrator'}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex min-h-[42px] items-center gap-2 rounded-pill border border-line-strong px-5 text-sm font-medium text-ink hover:border-ink/25 hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Admin
          </Link>

          <button
            type="button"
            onClick={handleLock}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-pill border border-line-strong px-5 text-sm font-medium text-state-error hover:border-state-error hover:bg-state-error/5 transition-colors"
          >
            <Lock className="h-4 w-4" />
            Lock DBMS
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-state-error bg-paper px-5 py-4 text-sm text-state-error"
        >
          {error}
        </div>
      )}

      {/* Tabs navigation: Relational Schema vs All Records */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-pill px-6 text-sm font-semibold transition-all duration-fast ${
              activeTab === 'schema'
                ? 'bg-ink text-paper-raised shadow-sm'
                : 'text-ink-muted hover:bg-paper-raised hover:text-ink'
            }`}
          >
            <GitFork className="h-4 w-4" />
            <span>Relational Schema</span>
            {schema && (
              <span className="ml-1 rounded-pill bg-paper-raised/20 px-2 py-0.5 text-xs">
                {schema.summary.totalRelations} relations
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('records')}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-pill px-6 text-sm font-semibold transition-all duration-fast ${
              activeTab === 'records'
                ? 'bg-ink text-paper-raised shadow-sm'
                : 'text-ink-muted hover:bg-paper-raised hover:text-ink'
            }`}
          >
            <TableIcon className="h-4 w-4" />
            <span>All Records</span>
            {schema && (
              <span className="ml-1 rounded-pill bg-paper-raised/20 px-2 py-0.5 text-xs">
                {schema.summary.totalTables} tables
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={loadSchema}
          disabled={loadingSchema}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2 text-xs font-medium text-ink-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingSchema ? 'animate-spin' : ''}`} />
          <span>Reload Schema</span>
        </button>
      </div>

      {/* Active Tab View */}
      {loadingSchema && !schema ? (
        <div className="card py-20 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-ink-muted mx-auto mb-4" />
          <p className="text-base font-semibold text-ink">Analyzing database relational schema…</p>
          <p className="text-xs text-ink-muted mt-1">Reading tables, columns, and foreign key dependencies</p>
        </div>
      ) : activeTab === 'schema' ? (
        schema ? (
          <RelationalSchemaViewer
            schema={schema}
            onSelectTable={(tableName) => {
              setSelectedTable(tableName);
              setActiveTab('records');
            }}
          />
        ) : null
      ) : (
        <AllRecordsViewer
          tables={tableSummaries}
          selectedTable={selectedTable}
          onSelectTable={(name) => setSelectedTable(name)}
          onViewSchema={() => setActiveTab('schema')}
        />
      )}
    </div>
  );
}
