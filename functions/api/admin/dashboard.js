export async function onRequestGet(context) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  // Paginate through all completed Stripe checkout sessions
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
      totalRevenue,
      monthRevenue,
      weekRevenue,
      totalCustomers: allSessions.length,
      monthCustomers: allSessions.filter(s => s.created > thirtyDaysAgo).length,
      weekCustomers: allSessions.filter(s => s.created > sevenDaysAgo).length,
    },
    customers,
  }), { headers });
}
