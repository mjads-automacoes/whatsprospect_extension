import { canonicalPhoneKey } from './phoneUtils.js';

function stripAccents(text) {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function nameCityKey(lead) {
  const name = stripAccents(lead.nome || '').trim().toLowerCase();
  const city = stripAccents(lead.cidade || '').trim().toLowerCase();
  return `${name}|${city}`;
}

/**
 * Retorna uma chave estável de deduplicação para um lead.
 * Prioriza o placeId (identificador único do Google), depois o telefone,
 * e por fim nome+cidade como último recurso.
 */
export function dedupeKey(lead) {
  if (lead.placeId) return `place:${lead.placeId}`;
  const phoneKey = canonicalPhoneKey(lead.telefone || lead.telefoneCru);
  if (phoneKey) return `phone:${phoneKey}`;
  return `namecity:${nameCityKey(lead)}`;
}

/**
 * Remove leads duplicados de uma lista, mantendo a primeira ocorrência.
 */
export function dedupeLeads(leads) {
  const seen = new Set();
  const result = [];
  for (const lead of leads) {
    const key = dedupeKey(lead);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(lead);
  }
  return result;
}
