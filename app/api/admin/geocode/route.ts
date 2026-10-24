import { NextResponse } from 'next/server';
import { withAdmin, errorResponse } from '@/lib/api/admin';

export const dynamic = 'force-dynamic';

// Bengaluru bounding box and center coordinates
const BENGALURU_COORDS = {
  lat: 12.9716,
  lng: 77.5946,
  viewbox: '77.30,13.20,77.85,12.75', // Left (min Lon), Top (max Lat), Right (max Lon), Bottom (min Lat)
};

export async function GET(request: Request) {
  return withAdmin(async () => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');

    const headers = {
      'User-Agent': 'StringTheory-Admin/1.0 (contact@stringtheory.network)',
      'Accept': 'application/json',
    };

    // 1. Reverse Geocoding (Coordinates -> Address / Location description)
    if (lat && lon) {
      try {
        const reverseUrl = new URL('https://nominatim.openstreetmap.org/reverse');
        reverseUrl.searchParams.set('lat', lat);
        reverseUrl.searchParams.set('lon', lon);
        reverseUrl.searchParams.set('format', 'json');
        reverseUrl.searchParams.set('addressdetails', '1');

        const res = await fetch(reverseUrl.toString(), {
          headers,
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          return NextResponse.json({
            lat: Number(lat),
            lon: Number(lon),
            displayName: `Location (${lat}, ${lon})`,
          });
        }

        const data = await res.json();
        const address = data.address || {};
        const road = address.road || address.pedestrian || address.street || '';
        const suburb = address.suburb || address.neighbourhood || address.city_district || '';
        const city = address.city || address.town || 'Bengaluru';

        const shortLocation = [road, suburb, city].filter(Boolean).join(', ');

        return NextResponse.json({
          lat: Number(data.lat || lat),
          lon: Number(data.lon || lon),
          displayName: data.display_name,
          shortLocation: shortLocation || data.display_name,
          address,
        });
      } catch (err) {
        console.warn('[geocode] reverse geocoding error:', err);
        return NextResponse.json({
          lat: Number(lat),
          lon: Number(lon),
          displayName: `Location (${lat}, ${lon})`,
        });
      }
    }

    // 2. Forward Geocoding (Location text -> Coordinates)
    if (!query || query.trim().length === 0) {
      return errorResponse({ error: 'Search query "q" or coordinates "lat/lon" required.' }, 400);
    }

    const trimmedQuery = query.trim();
    // If query doesn't mention Bengaluru/Bangalore, bias heavily with Bengaluru appended
    const hasCity = /bengaluru|bangalore/i.test(trimmedQuery);
    const searchQuery = hasCity ? trimmedQuery : `${trimmedQuery}, Bengaluru`;

    try {
      const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
      searchUrl.searchParams.set('q', searchQuery);
      searchUrl.searchParams.set('format', 'json');
      searchUrl.searchParams.set('limit', '5');
      searchUrl.searchParams.set('viewbox', BENGALURU_COORDS.viewbox);
      searchUrl.searchParams.set('bounded', '0'); // Prioritize viewbox without excluding other matches

      const res = await fetch(searchUrl.toString(), {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`Nominatim returned status ${res.status}`);
      }

      const list = await res.json();

      if (Array.isArray(list) && list.length > 0) {
        const results = list.map((item: any) => ({
          name: item.name || item.display_name?.split(',')[0],
          displayName: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          type: item.type,
        }));

        return NextResponse.json({ results });
      }

      // If no result with city suffix, try original query
      if (!hasCity) {
        const fallbackUrl = new URL('https://nominatim.openstreetmap.org/search');
        fallbackUrl.searchParams.set('q', trimmedQuery);
        fallbackUrl.searchParams.set('format', 'json');
        fallbackUrl.searchParams.set('limit', '5');
        fallbackUrl.searchParams.set('viewbox', BENGALURU_COORDS.viewbox);

        const fallbackRes = await fetch(fallbackUrl.toString(), {
          headers,
          signal: AbortSignal.timeout(5000),
        });

        if (fallbackRes.ok) {
          const fallbackList = await fallbackRes.json();
          if (Array.isArray(fallbackList) && fallbackList.length > 0) {
            const results = fallbackList.map((item: any) => ({
              name: item.name || item.display_name?.split(',')[0],
              displayName: item.display_name,
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
              type: item.type,
            }));
            return NextResponse.json({ results });
          }
        }
      }

      // Return default center of Bengaluru if nothing was found
      return NextResponse.json({
        results: [
          {
            name: trimmedQuery,
            displayName: `${trimmedQuery} (Estimated near Central Bengaluru)`,
            lat: BENGALURU_COORDS.lat,
            lon: BENGALURU_COORDS.lng,
            type: 'fallback',
          },
        ],
      });
    } catch (err) {
      console.error('[geocode] lookup failed:', err);
      return NextResponse.json({
        results: [
          {
            name: trimmedQuery,
            displayName: `${trimmedQuery} (Central Bengaluru)`,
            lat: BENGALURU_COORDS.lat,
            lon: BENGALURU_COORDS.lng,
            type: 'fallback',
          },
        ],
      });
    }
  });
}
