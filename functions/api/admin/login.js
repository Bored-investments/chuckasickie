async function generateToken(secret) {
  const payload = btoa(JSON.stringify({ exp: Date.now() + 86400000 }));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

export async function onRequest(context) {
  const headers = { 'Content-Type': 'application/json' };

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const { username, password } = await context.request.json();
    if (username !== 'kangaroo' || password !== 'jack') {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers });
    }
    const token = await generateToken(context.env.ADMIN_SECRET);
    return new Response(JSON.stringify({ token }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers });
  }
}
