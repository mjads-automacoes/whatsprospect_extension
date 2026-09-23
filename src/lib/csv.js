// Geração de CSV compatível com Excel (pt-BR) e Google Sheets.

const CSV_DELIMITER = ';'; // Excel em pt-BR usa ; como separador de lista por padrão
const CSV_COLUMNS = [
  { key: 'nome', label: 'Nome' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'Estado' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'site', label: 'Site' },
  { key: 'endereco', label: 'Endereço' },
  { key: 'origemLink', label: 'Origem/Link' },
  { key: 'palavraChave', label: 'Palavra-chave' },
];

function escapeCsvValue(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(CSV_DELIMITER) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converte uma lista de leads em uma string CSV, incluindo BOM UTF-8
 * para que acentuação seja exibida corretamente no Excel.
 */
export function leadsToCsv(leads) {
  const header = CSV_COLUMNS.map((c) => escapeCsvValue(c.label)).join(CSV_DELIMITER);
  const rows = leads.map((lead) =>
    CSV_COLUMNS.map((c) => escapeCsvValue(lead[c.key])).join(CSV_DELIMITER)
  );
  const BOM = '﻿';
  return BOM + [header, ...rows].join('\r\n');
}

export function buildCsvFileName({ segmento, cidades }) {
  const stamp = new Date().toISOString().slice(0, 10);
  const seg = (segmento || 'leads').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-');
  const citySlug = (cidades && cidades[0] ? cidades[0] : '').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-');
  return `leads-${seg}${citySlug ? `-${citySlug}` : ''}-${stamp}.csv`;
}
