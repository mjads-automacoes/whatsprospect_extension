import { textSearch } from './placesApi.js';
import { dedupeKey, dedupeLeads } from './dedupe.js';
import { formatBrazilianPhone, isValidBrazilianPhone } from './phoneUtils.js';
import { getHistory } from './storage.js';

/**
 * Orquestra a busca de leads: combina cada variação de palavra-chave com
 * cada cidade, consulta a Places API, remove duplicados, padroniza
 * telefones e aplica os filtros solicitados pelo usuário.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string[]} params.variacoes - variações da palavra-chave já confirmadas pelo usuário
 * @param {string[]} params.cidades
 * @param {number} params.quantidade - quantidade total de leads desejada
 * @param {boolean} params.somenteComTelefone
 * @param {boolean} params.ignorarHistorico - pula empresas já prospectadas anteriormente
 * @param {(progress: object) => void} [onProgress]
 */
export async function buscarLeads(params, onProgress = () => {}) {
  const {
    apiKey,
    variacoes,
    cidades,
    quantidade,
    somenteComTelefone = true,
    ignorarHistorico = true,
  } = params;

  const history = ignorarHistorico ? await getHistory() : {};
  const collected = [];
  const seenKeys = new Set();

  outer: for (const cidade of cidades) {
    for (const variacao of variacoes) {
      const query = `${variacao} em ${cidade}`;
      onProgress({ status: 'buscando', query, totalEncontrado: collected.length });

      let resultados = [];
      try {
        resultados = await textSearch(apiKey, query, {
          cidade,
          maxResults: Math.max(1, quantidade - collected.length) + 5,
        });
      } catch (error) {
        onProgress({ status: 'erro', query, mensagem: error.message });
        continue;
      }

      for (const lead of resultados) {
        if (somenteComTelefone && !isValidBrazilianPhone(lead.telefoneCru)) {
          continue;
        }

        const telefoneFormatado = formatBrazilianPhone(lead.telefoneCru);
        const leadFinal = {
          ...lead,
          telefone: telefoneFormatado || lead.telefoneCru || '',
        };

        const key = dedupeKey(leadFinal);
        if (seenKeys.has(key)) continue;
        if (ignorarHistorico && history[key]) continue;

        seenKeys.add(key);
        collected.push(leadFinal);
        onProgress({ status: 'lead-encontrado', totalEncontrado: collected.length, lead: leadFinal });

        if (collected.length >= quantidade) break outer;
      }
    }
  }

  const finalLeads = dedupeLeads(collected);
  onProgress({ status: 'concluido', totalEncontrado: finalLeads.length });
  return finalLeads;
}
