async function verifyToken(token, secret) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  try {
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now()) return false;
  } catch { return false; }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname.endsWith('/login')) return context.next();

  const auth = context.request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!await verifyToken(token, context.env.ADMIN_SECRET)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return context.next();
}
