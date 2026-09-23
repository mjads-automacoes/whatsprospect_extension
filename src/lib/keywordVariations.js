// Gera variações relevantes de um segmento/palavra-chave de busca.
// Ex.: "Oficina mecânica" -> ["Oficina mecânica", "Centro automotivo", "Auto Center", ...]

function stripAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeKey(text) {
  return stripAccents(text.trim().toLowerCase()).replace(/\s+/g, ' ');
}

// Dicionário de sinônimos/variações para segmentos comuns no Brasil.
// Chaves normalizadas (sem acento, minúsculas).
const SYNONYM_DICTIONARY = {
  'oficina mecanica': [
    'Oficina mecânica',
    'Centro automotivo',
    'Auto Center',
    'Mecânica automotiva',
    'Manutenção automotiva',
    'Oficina de carros',
    'Auto mecânica',
  ],
  'oficina': [
    'Oficina mecânica',
    'Centro automotivo',
    'Auto Center',
    'Oficina de carros',
  ],
  'auto center': ['Auto Center', 'Centro automotivo', 'Oficina mecânica'],
  'funilaria e pintura': [
    'Funilaria e pintura',
    'Funilaria automotiva',
    'Pintura automotiva',
    'Reparação automotiva',
  ],
  'borracharia': ['Borracharia', 'Loja de pneus', 'Assistência de pneus'],
  'autopecas': ['Autopeças', 'Loja de autopeças', 'Peças automotivas'],
  'guincho': ['Guincho', 'Auto socorro', 'Reboque de veículos'],
  'lavagem de carros': ['Lava rápido', 'Lavagem de carros', 'Estética automotiva'],
  'salao de beleza': [
    'Salão de beleza',
    'Cabeleireiro',
    'Studio de beleza',
    'Salão de estética',
  ],
  'barbearia': ['Barbearia', 'Barbeiro', 'Studio de barba e cabelo'],
  'estetica': ['Clínica de estética', 'Studio de estética', 'Centro de estética'],
  'restaurante': ['Restaurante', 'Casa de comida', 'Buffet', 'Restaurante a quilo'],
  'pizzaria': ['Pizzaria', 'Pizza delivery', 'Casa de pizza'],
  'lanchonete': ['Lanchonete', 'Hamburgueria', 'Fast food'],
  'padaria': ['Padaria', 'Panificadora', 'Confeitaria'],
  'academia': ['Academia', 'Studio de fitness', 'Centro de treinamento', 'Academia de musculação'],
  'clinica odontologica': [
    'Clínica odontológica',
    'Consultório odontológico',
    'Dentista',
    'Clínica dentária',
  ],
  'dentista': ['Dentista', 'Clínica odontológica', 'Consultório odontológico'],
  'clinica medica': ['Clínica médica', 'Consultório médico', 'Centro médico'],
  'advocacia': ['Escritório de advocacia', 'Advogado', 'Consultoria jurídica'],
  'contabilidade': ['Escritório de contabilidade', 'Contador', 'Assessoria contábil'],
  'imobiliaria': ['Imobiliária', 'Corretora de imóveis', 'Administradora de imóveis'],
  'pet shop': ['Pet shop', 'Loja de produtos para animais', 'Banho e tosa'],
  'loja de roupas': ['Loja de roupas', 'Boutique', 'Confecção', 'Loja de moda'],
  'farmacia': ['Farmácia', 'Drogaria'],
  'mercado': ['Mercado', 'Supermercado', 'Mercearia', 'Minimercado'],
  'construtora': ['Construtora', 'Empreiteira', 'Engenharia civil'],
  'energia solar': [
    'Energia solar',
    'Energia fotovoltaica',
    'Instalação de energia solar',
    'Painéis solares',
    'Sistema fotovoltaico',
    'Placas solares',
  ],
  'marcenaria': ['Marcenaria', 'Móveis planejados', 'Carpintaria'],
  'serralheria': ['Serralheria', 'Metalúrgica', 'Estruturas metálicas'],
  'vidracaria': ['Vidraçaria', 'Espelhos e vidros'],
  'eletricista': ['Eletricista', 'Instalações elétricas', 'Assistência elétrica'],
  'encanador': ['Encanador', 'Serviços hidráulicos', 'Desentupidora'],
  'chaveiro': ['Chaveiro', 'Chaves e fechaduras'],
  'transportadora': ['Transportadora', 'Logística e transporte', 'Frete e mudanças'],
  'agencia de viagens': ['Agência de viagens', 'Operadora de turismo'],
  'corretora de seguros': ['Corretora de seguros', 'Seguros', 'Corretor de seguros'],
  'assistencia tecnica': [
    'Assistência técnica',
    'Assistência técnica de informática',
    'Conserto de celular',
    'Assistência técnica de eletrônicos',
  ],
};

/**
 * Retorna variações conhecidas para o termo informado.
 * Se não houver entrada no dicionário, retorna apenas o termo original
 * (o usuário pode complementar manualmente na interface).
 */
export function generateKeywordVariations(baseKeyword) {
  const trimmed = baseKeyword.trim();
  if (!trimmed) return [];

  const key = normalizeKey(trimmed);
  const known = SYNONYM_DICTIONARY[key];
  const variations = new Set();

  variations.add(trimmed);
  if (known) {
    for (const v of known) variations.add(v);
  } else {
    // tenta encontrar por correspondência parcial (ex.: "oficina mecanica de motos")
    for (const dictKey of Object.keys(SYNONYM_DICTIONARY)) {
      if (key.includes(dictKey) || dictKey.includes(key)) {
        for (const v of SYNONYM_DICTIONARY[dictKey]) variations.add(v);
        break;
      }
    }
  }

  return Array.from(variations);
}
