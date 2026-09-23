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
export async function upsertLeads({ supabaseUrl, anonKey }, leadsWithKeys) {
  if (!leadsWithKeys.length) return;

  const rows = leadsWithKeys.map(({ key, lead }) => toRow(lead, key));

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

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
