// Conecta a extensão à Management API do Supabase via OAuth (PKCE),
// sem nunca expor um Client Secret dentro do código da extensão.
//
// Fluxo:
//  1. Gera um code_verifier/code_challenge (PKCE) no próprio navegador.
//  2. Abre a tela de autorização do Supabase via chrome.identity —
//     o usuário faz login/consentimento lá (não na extensão).
//  3. O Chrome captura o redirect com o `code`.
//  4. A extensão manda esse `code` (+ code_verifier) pra uma Edge Function
//     leve (supabase/functions/oauth-exchange), que é a única peça que
//     conhece o Client Secret e faz a troca por um access token.
//  5. O access token retornado é usado como bearer na Management API
//     (mesma interface que um Personal Access Token) pra criar o projeto,
//     rodar o schema e buscar as chaves — tudo em supabaseManagementApi.js.

import { MANAGEMENT_OAUTH_CLIENT_ID, OAUTH_RELAY_URL } from './oauthConfig.js';

export const CONNECTION_KEY = 'whatsprospect.supabaseConnection';
const AUTHORIZE_URL = 'https://api.supabase.com/v1/oauth/authorize';

function base64url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function codeChallengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function getRedirectUrl() {
  return chrome.identity.getRedirectURL();
}

export function isMaintainerConfigured() {
  return Boolean(MANAGEMENT_OAUTH_CLIENT_ID && OAUTH_RELAY_URL);
}

export async function getConnection() {
  const stored = await chrome.storage.local.get(CONNECTION_KEY);
  return stored[CONNECTION_KEY] || null;
}

async function saveConnection(tokens) {
  const connection = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  };
  await chrome.storage.local.set({ [CONNECTION_KEY]: connection });
  return connection;
}

export async function disconnect() {
  await chrome.storage.local.remove(CONNECTION_KEY);
}

function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!redirectUrl) {
        reject(new Error('Conexão cancelada.'));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

async function callRelay(payload) {
  const response = await fetch(OAUTH_RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Erro na troca de token (${response.status}).`);
  }
  return data;
}

/**
 * Inicia o fluxo de conexão OAuth com a Management API do Supabase.
 * Retorna a conexão salva (com accessToken pronto pra uso).
 */
export async function connect() {
  if (!isMaintainerConfigured()) {
    throw new Error(
      'Setup do mantenedor incompleto: preencha MANAGEMENT_OAUTH_CLIENT_ID e OAUTH_RELAY_URL em src/lib/oauthConfig.js (veja o README).'
    );
  }

  const verifier = randomVerifier();
  const challenge = await codeChallengeFor(verifier);
  const state = randomVerifier();
  const redirectTo = getRedirectUrl();

  const authorizeUrl =
    `${AUTHORIZE_URL}?client_id=${encodeURIComponent(MANAGEMENT_OAUTH_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectTo)}` +
    `&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

  const finalUrl = await launchWebAuthFlow(authorizeUrl);
  const params = new URL(finalUrl).searchParams;

  const errorDescription = params.get('error_description') || params.get('error');
  if (errorDescription) throw new Error(errorDescription);

  const code = params.get('code');
  if (!code) throw new Error('Nenhum código de autorização retornado.');
  if (params.get('state') !== state) throw new Error('Estado OAuth inválido (possível interferência).');

  const tokens = await callRelay({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectTo,
    code_verifier: verifier,
  });

  return saveConnection(tokens);
}

async function refresh(refreshToken) {
  const tokens = await callRelay({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return saveConnection(tokens);
}

/**
 * Retorna um access token válido da Management API, renovando via a Edge
 * Function se necessário. Retorna null se não houver conexão.
 */
export async function ensureValidManagementToken() {
  const connection = await getConnection();
  if (!connection) return null;

  const isExpiringSoon = Date.now() > connection.expiresAt - 60_000;
  if (!isExpiringSoon) return connection.accessToken;

  const refreshed = await refresh(connection.refreshToken);
  return refreshed.accessToken;
}
