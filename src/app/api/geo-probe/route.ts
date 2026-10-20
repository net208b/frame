import { headers } from 'next/headers';

import { visitorPlace } from '@/lib/geo/visitor';

/**
 * TEMPORARY. Reports which geolocation headers this deployment actually
 * receives, so the city map can be built against what the platform really sends
 * rather than against its documentation. Delete once that is settled.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const received = await headers();
  const geo: Record<string, string | null> = {};
  for (const [name, value] of received.entries()) {
    if (name.startsWith('x-vercel-ip-')) geo[name] = value;
  }

  return Response.json(
    { headers: geo, resolved: await visitorPlace() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
