async function authorized(request, secret) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  try {
    const data = JSON.parse(atob(parts[0]));
    if (data.exp < Date.now()) return false;
  } catch { return false; }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(parts[0]));
}

export async function onRequest(context) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  if (!await authorized(context.request, context.env.ADMIN_SECRET)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  let allSessions = [];
  let startingAfter = null;

  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ limit: '100', status: 'complete' });
    if (startingAfter) params.append('starting_after', startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params}`, {
      headers: { Authorization: `Bearer ${context.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!data.data?.length) break;

    allSessions = [...allSessions, ...data.data.filter(s => s.payment_status === 'paid')];
    if (!data.has_more) break;
    startingAfter = data.data[data.data.length - 1].id;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = nowSec - 30 * 86400;
  const sevenDaysAgo = nowSec - 7 * 86400;

  const totalRevenue = allSessions.reduce((s, c) => s + (c.amount_total || 0), 0) / 100;
  const monthRevenue = allSessions.filter(s => s.created > thirtyDaysAgo).reduce((s, c) => s + (c.amount_total || 0), 0) / 100;
  const weekRevenue = allSessions.filter(s => s.created > sevenDaysAgo).reduce((s, c) => s + (c.amount_total || 0), 0) / 100;

  const customers = allSessions
    .map(s => ({
      session_id: s.id,
      email: s.customer_details?.email || '—',
      name: s.customer_details?.name || '—',
      amount: (s.amount_total || 0) / 100,
      created: s.created,
    }))
    .sort((a, b) => b.created - a.created);

  return new Response(JSON.stringify({
    stats: {
      totalRevenue, monthRevenue, weekRevenue,
      totalCustomers: allSessions.length,
      monthCustomers: allSessions.filter(s => s.created > thirtyDaysAgo).length,
      weekCustomers: allSessions.filter(s => s.created > sevenDaysAgo).length,
    },
    customers,
  }), { headers });
}
