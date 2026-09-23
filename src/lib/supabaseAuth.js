// Autenticação com Supabase Auth (OAuth Google) usando chrome.identity.
//
// Fluxo: chrome.identity.launchWebAuthFlow abre a tela de login do Google
// (via Supabase, que já sabe conversar com o provedor Google configurado
// no painel do projeto). O redirecionamento final cai numa URL
// https://<id-da-extensão>.chromiumapp.org/#access_token=...&refresh_token=...
// que o Chrome captura sem precisar de um servidor próprio.
//
// Pré-requisito no painel do Supabase (Authentication > URL Configuration):
// adicionar chrome.identity.getRedirectURL() (impressa no console/Opções)
// à lista de "Redirect URLs" permitidas.

export const SESSION_KEY = 'whatsprospect.supabaseSession';

export function getRedirectUrl() {
  return chrome.identity.getRedirectURL();
}

export async function getSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return stored[SESSION_KEY] || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

export async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}

function parseTokensFromRedirect(redirectUrl) {
  const hashIndex = redirectUrl.indexOf('#');
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(redirectUrl.slice(hashIndex + 1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = Number(params.get('expires_in') || '3600');
  const errorDescription = params.get('error_description');

  if (errorDescription) {
    throw new Error(errorDescription);
  }
  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!redirectUrl) {
        reject(new Error('Login cancelado.'));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

/**
 * Inicia o login com Google via Supabase Auth.
 * Requer supabaseUrl configurado nas Opções (Authentication > Providers >
 * Google já habilitado no projeto Supabase, com client id/secret do
 * Google Cloud Console).
 */
export async function signInWithGoogle(supabaseUrl) {
  if (!supabaseUrl) {
    throw new Error('Configure a URL do projeto Supabase em Opções antes de entrar.');
  }

  const redirectTo = getRedirectUrl();
  const authorizeUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

  const finalUrl = await launchWebAuthFlow(authorizeUrl);
  const tokens = parseTokensFromRedirect(finalUrl);
  if (!tokens) {
    throw new Error('Não foi possível concluir o login (nenhum token retornado).');
  }

  const session = await fetchUser(supabaseUrl, tokens);
  return saveSession(session);
}

async function fetchUser(supabaseUrl, tokens) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      apikey: tokens.accessToken, // apikey é exigido pelo Supabase; o access token também é aceito aqui
    },
  });
  const user = response.ok ? await response.json() : null;
  return { ...tokens, user };
}

async function refreshSession(supabaseUrl, supabaseAnonKey, refreshToken) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const data = await response.json();
  const session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    user: data.user || null,
  };
  return saveSession(session);
}

/**
 * Garante um access token válido, renovando via refresh token se estiver
 * perto de expirar. Retorna null se não houver sessão.
 */
export async function ensureValidAccessToken(supabaseUrl, supabaseAnonKey) {
  const session = await getSession();
  if (!session) return null;

  const isExpiringSoon = Date.now() > session.expiresAt - 60_000;
  if (!isExpiringSoon) return session.accessToken;

  const refreshed = await refreshSession(supabaseUrl, supabaseAnonKey, session.refreshToken);
  return refreshed.accessToken;
}

export async function signOut() {
  await clearSession();
}
