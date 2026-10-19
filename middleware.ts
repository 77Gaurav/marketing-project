import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle requests to /admin/store and /admin/store/
  if (pathname === '/admin/store' || pathname === '/admin/store/') {
    // If it's a POST request (e.g. adding a device via API)
    if (request.method === 'POST') {
      return NextResponse.rewrite(new URL('/api/admin/store/devices', request.url));
    }

    // If it's an explicit JSON GET request
    const accept = request.headers.get('accept') || '';
    if (request.method === 'GET' && accept.includes('application/json')) {
      return NextResponse.rewrite(new URL('/api/admin/store/devices', request.url));
    }
  }

  // Handle requests to /api/admin/store and /api/admin/store/
  if (pathname === '/api/admin/store' || pathname === '/api/admin/store/') {
    return NextResponse.rewrite(new URL('/api/admin/store/devices', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/store',
    '/admin/store/',
    '/api/admin/store',
    '/api/admin/store/',
  ],
};
