// Edge Function "oauth-exchange"
//
// Única função: trocar o código de autorização (ou o refresh token) do
// fluxo OAuth de gerenciamento do Supabase (api.supabase.com/v1/oauth)
// por um access token, sem que o CLIENT_SECRET do OAuth App precise
// existir dentro do código da extensão (que é público/inspecionável por
// qualquer instalador).
//
// Deploy (uma vez, pelo mantenedor da extensão):
//   supabase functions deploy oauth-exchange --no-verify-jwt
//   supabase secrets set OAUTH_CLIENT_ID=... OAUTH_CLIENT_SECRET=...
//
// Esta função não guarda nenhum dado — só repassa a troca de token pra
// api.supabase.com e devolve a resposta. Não há armazenamento, log de
// tokens, nem estado entre chamadas.

const CLIENT_ID = Deno.env.get('OAUTH_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('OAUTH_CLIENT_SECRET') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return new Response(
      JSON.stringify({ error: 'server_misconfigured', error_description: 'OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET não configurados.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_request' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const params = new URLSearchParams();

  if (body.grant_type === 'authorization_code') {
    if (!body.code || !body.redirect_uri || !body.code_verifier) {
      return new Response(JSON.stringify({ error: 'invalid_request', error_description: 'code/redirect_uri/code_verifier ausentes.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
    params.set('redirect_uri', body.redirect_uri);
    params.set('code_verifier', body.code_verifier);
  } else if (body.grant_type === 'refresh_token') {
    if (!body.refresh_token) {
      return new Response(JSON.stringify({ error: 'invalid_request', error_description: 'refresh_token ausente.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refresh_token);
  } else {
    return new Response(JSON.stringify({ error: 'unsupported_grant_type' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const basicAuth = 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

  const upstream = await fetch('https://api.supabase.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth,
    },
    body: params.toString(),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
