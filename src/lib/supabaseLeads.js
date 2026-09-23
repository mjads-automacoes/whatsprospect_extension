// Sincronização de leads com a tabela `public.leads` no Supabase
// (ver supabase/schema.sql). Cada empresa tem o próprio projeto Supabase
// (criado via Opções → Conectar com Supabase), então o isolamento entre
// empresas acontece no nível do projeto — não precisa de login de usuário
// final dentro da extensão, só da chave anônima daquele projeto.

function toRow(lead, dedupeKeyValue) {
  return {
    dedupe_key: dedupeKeyValue,
    nome: lead.nome || '',
    telefone: lead.telefone || '',
    cidade: lead.cidade || '',
    estado: lead.estado || '',
    categoria: lead.categoria || '',
    endereco: lead.endereco || '',
    site: lead.site || '',
    origem_link: lead.origemLink || '',
    palavra_chave: lead.palavraChave || '',
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * Envia leads para o Supabase usando upsert (merge por dedupe_key), para
 * não duplicar quando a mesma empresa aparecer em buscas futuras.
 *
 * @param {{supabaseUrl: string, anonKey: string}} project
 * @param {Array<{key: string, lead: object}>} leadsWithKeys
 */
// Tempo máximo de espera pelo Supabase antes de desistir. Sem isso, uma
// rede instável pode deixar o fetch pendurado indefinidamente e travar
// a busca inteira, já que o job só avança pra próxima combinação depois
// que a sincronização termina (ver syncLeadsToSupabase no service worker).
const SYNC_TIMEOUT_MS = 10000;

export async function upsertLeads({ supabaseUrl, anonKey }, leadsWithKeys) {
  if (!leadsWithKeys.length) return;

  const rows = leadsWithKeys.map(({ key, lead }) => toRow(lead, key));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  let response;
  try {
    // on_conflict é obrigatório: sem ele, o PostgREST tenta fazer upsert
    // pela chave primária (id, que é sempre um UUID novo gerado a cada
    // linha e por isso nunca colide), caindo num INSERT comum que esbarra
    // na constraint UNIQUE de dedupe_key com um erro 409 em vez de fazer
    // merge.
    response = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/leads?on_conflict=dedupe_key`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
        signal: controller.signal,
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Falha ao sincronizar leads com o Supabase: tempo esgotado (${SYNC_TIMEOUT_MS}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Falha ao sincronizar leads com o Supabase (${response.status}): ${detail}`);
  }
}

/**
 * Busca todos os leads salvos no projeto. Útil para um botão futuro de
 * "sincronizar/exportar da nuvem".
 */
export async function fetchAllLeads({ supabaseUrl, anonKey }) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/leads?select=*&order=prospectado_em.desc`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Falha ao buscar leads do Supabase (${response.status})`);
  }

  return response.json();
}
