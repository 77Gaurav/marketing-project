import { headers } from 'next/headers';
import { getSessionUser } from '@/lib/auth/session';
import { traceAdminRequest } from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

/**
 * Root layout for all /admin routes.
 *
 * Instrument all admin page visits with Pydantic Logfire spans and traces.
 * Automatically tracks page load requests, user session status, and rendering lifecycle.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let path = '/admin';
  try {
    const h = headers();
    path = h.get('x-url') || h.get('x-invoke-path') || h.get('next-url') || '/admin';
  } catch {}

  let user = null;
  try {
    user = await getSessionUser();
  } catch {}

  return await traceAdminRequest(
    {
      name: `admin.page: ${path}`,
      method: 'GET',
      path,
      admin: user ? { id: user.id, email: user.email, role: user.role } : undefined,
      attributes: {
        'admin.type': 'page_navigation',
        'admin.authenticated': user?.role === 'ADMIN',
      },
    },
    async () => {
      return <>{children}</>;
    },
  );
}
