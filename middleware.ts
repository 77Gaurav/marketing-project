import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-url', pathname);
  requestHeaders.set('x-method', request.method);

  // Handle requests to /admin/store/activate
  if (pathname === '/admin/store/activate' || pathname === '/admin/store/activate/') {
    // If it's a POST request (hardware player activation request from Raspberry Pi)
    if (request.method === 'POST') {
      return NextResponse.rewrite(new URL('/api/admin/store/activate', request.url), {
        request: { headers: requestHeaders },
      });
    }

    // If it's an explicit JSON GET request
    const accept = request.headers.get('accept') || '';
    if (request.method === 'GET' && accept.includes('application/json')) {
      return NextResponse.rewrite(new URL('/api/admin/store/activate', request.url), {
        request: { headers: requestHeaders },
      });
    }
  }

  // Handle requests to /admin/store and /admin/store/
  if (pathname === '/admin/store' || pathname === '/admin/store/') {
    // If it's a POST request (e.g. adding a device via API)
    if (request.method === 'POST') {
      return NextResponse.rewrite(new URL('/api/admin/store/devices', request.url), {
        request: { headers: requestHeaders },
      });
    }

    // If it's an explicit JSON GET request
    const accept = request.headers.get('accept') || '';
    if (request.method === 'GET' && accept.includes('application/json')) {
      return NextResponse.rewrite(new URL('/api/admin/store/devices', request.url), {
        request: { headers: requestHeaders },
      });
    }
  }

  // Handle requests to /api/admin/store and /api/admin/store/
  if (pathname === '/api/admin/store' || pathname === '/api/admin/store/') {
    return NextResponse.rewrite(new URL('/api/admin/store/devices', request.url), {
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
