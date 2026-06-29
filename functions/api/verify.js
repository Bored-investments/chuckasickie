export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const sessionId = searchParams.get('session_id');
  const headers = { 'Content-Type': 'application/json' };

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return new Response(JSON.stringify({ valid: false }), { status: 400, headers });
  }

  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${context.env.STRIPE_SECRET_KEY}` },
    });
    const session = await res.json();
    const valid = session.payment_status === 'paid' && session.status === 'complete';

    if (valid && context.env.DB) {
      const email = session.customer_details?.email;
      if (email) {
        const record = {
          session_id: sessionId,
          email,
          name: session.customer_details?.name || '',
          amount: (session.amount_total || 0) / 100,
          created: session.created,
        };
        await context.env.DB.put(`customer:${email}`, JSON.stringify(record));
        await context.env.DB.put(`session:${sessionId}`, JSON.stringify(record));
      }
    }

    return new Response(JSON.stringify({ valid }), { headers });
  } catch {
    return new Response(JSON.stringify({ valid: false }), { status: 500, headers });
  }
}
