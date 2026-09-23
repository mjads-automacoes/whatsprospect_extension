// Cliente para a Supabase Management API (https://api.supabase.com/v1),
// usado para provisionar automaticamente um projeto Supabase a partir de
// um Personal Access Token colado pelo usuário nas Opções.
//
// AVISO DE PRECISÃO: alguns campos aqui (principalmente os nomes usados em
// PATCH /config/auth para redirect URLs e provedor Google) foram
// reconstruídos a partir da convenção de variáveis de ambiente do GoTrue
// (o serviço de auth por trás do Supabase) e de buscas na documentação,
// porque o acesso direto à documentação da Supabase não estava disponível
// no ambiente onde este código foi escrito. Se algum desses campos tiver
// mudado, a chamada correspondente falha com o erro cru da API (ver
// `mgmtFetch`), o que facilita ajustar só aquele trecho sem afetar o
// resto do provisionamento.

const BASE_URL = 'https://api.supabase.com/v1';

async function mgmtFetch(pat, path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pat}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${path} → ${response.status}: ${detail || response.statusText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function listOrganizations(pat) {
  return mgmtFetch(pat, '/organizations');
}

export async function createProject(pat, { name, organizationSlug, dbPass, regionCode = 'americas' }) {
  return mgmtFetch(pat, '/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      organization_slug: organizationSlug,
      db_pass: dbPass,
      region_selection: { type: 'smartGroup', code: regionCode },
      // desired_instance_size omitido de propósito: mantém o projeto no
      // tier gratuito ("nano", scale-to-zero).
    }),
  });
}

export async function getProject(pat, ref) {
  return mgmtFetch(pat, `/projects/${ref}`);
}

export async function waitForProjectActive(pat, ref, { timeoutMs = 180_000, intervalMs = 5_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const project = await getProject(pat, ref);
    if (/ACTIVE/i.test(project.status || '')) return project;
    if (/(FAILED|REMOVED|INACTIVE)/i.test(project.status || '')) {
      throw new Error(`Provisionamento do projeto falhou (status: ${project.status}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Tempo esgotado esperando o projeto ficar ativo.');
}

export async function runSql(pat, ref, query) {
  return mgmtFetch(pat, `/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function getApiKeys(pat, ref) {
  return mgmtFetch(pat, `/projects/${ref}/api-keys`);
}

/**
 * Retorna a chave pública (anon/publishable) dentre as chaves do projeto,
 * evitando a chave secreta/service_role.
 */
export function pickPublicApiKey(apiKeys) {
  const entries = Array.isArray(apiKeys) ? apiKeys : [];
  const publicKey = entries.find((k) => !/service_role|secret/i.test(k.name || k.type || ''));
  return publicKey?.api_key || publicKey?.apiKey || null;
}

export async function getAuthConfig(pat, ref) {
  return mgmtFetch(pat, `/projects/${ref}/config/auth`);
}

export async function addRedirectUrl(pat, ref, redirectUrl) {
  const current = await getAuthConfig(pat, ref);
  const existing = (current.URI_ALLOW_LIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!existing.includes(redirectUrl)) {
    existing.push(redirectUrl);
  }

  return mgmtFetch(pat, `/projects/${ref}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify({ URI_ALLOW_LIST: existing.join(',') }),
  });
}

/**
 * Melhor esforço: configura o provedor Google no Supabase Auth com um
 * Client ID/Secret que o usuário já criou manualmente no Google Cloud
 * Console (isso não tem como ser automatizado — ver README).
 */
export async function configureGoogleProvider(pat, ref, { clientId, clientSecret }) {
  if (!clientId || !clientSecret) return null;
  return mgmtFetch(pat, `/projects/${ref}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify({
      EXTERNAL_GOOGLE_ENABLED: true,
      EXTERNAL_GOOGLE_CLIENT_ID: clientId,
      EXTERNAL_GOOGLE_SECRET: clientSecret,
    }),
  });
}

export function generateDbPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) + 'Aa1!';
}
