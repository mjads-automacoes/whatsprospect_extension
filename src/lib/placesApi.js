// Integração com a Google Places API (New) - fonte de dados comerciais autorizada.
// Requer uma chave de API configurada na página de Opções, com a
// "Places API (New)" habilitada no Google Cloud Console e faturamento ativo.
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.formattedAddress',
  'places.addressComponents',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',');

export class PlacesApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PlacesApiError';
    this.status = status;
  }
}

function extractAddressPart(addressComponents, type) {
  if (!Array.isArray(addressComponents)) return '';
  const component = addressComponents.find((c) => (c.types || []).includes(type));
  return component ? component.shortText || component.longText || '' : '';
}

function mapPlaceToLead(place, { query, cidade }) {
  const displayName = place.displayName?.text || '';
  return {
    placeId: place.id || null,
    nome: displayName,
    telefoneCru: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
    cidade: extractAddressPart(place.addressComponents, 'administrative_area_level_2') || cidade,
    estado: extractAddressPart(place.addressComponents, 'administrative_area_level_1'),
    categoria: place.primaryTypeDisplayName?.text || '',
    endereco: place.formattedAddress || '',
    site: place.websiteUri || '',
    origemLink: place.googleMapsUri || '',
    palavraChave: query,
  };
}

/**
 * Executa uma busca de texto na Places API e retorna todas as páginas de
 * resultado (até maxResults ou até acabarem as páginas).
 *
 * @param {string} apiKey
 * @param {string} query - ex.: "Oficina mecânica em Birigui SP"
 * @param {object} opts
 * @param {string} opts.cidade - usado como fallback caso a API não retorne cidade
 * @param {number} opts.maxResults - máximo de resultados desejados nesta busca
 */
export async function textSearch(apiKey, query, { cidade = '', maxResults = 20 } = {}) {
  if (!apiKey) {
    throw new PlacesApiError('Chave de API do Google Places não configurada. Configure em Opções.', 0);
  }

  const leads = [];
  let pageToken;

  do {
    const body = {
      textQuery: query,
      languageCode: 'pt-BR',
      pageSize: Math.min(20, maxResults - leads.length),
    };
    if (pageToken) body.pageToken = pageToken;

    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson?.error?.message || '';
      } catch {
        // ignore parse errors
      }
      throw new PlacesApiError(
        `Erro na Places API (${response.status})${detail ? `: ${detail}` : ''}`,
        response.status
      );
    }

    const data = await response.json();
    const places = data.places || [];
    for (const place of places) {
      leads.push(mapPlaceToLead(place, { query, cidade }));
      if (leads.length >= maxResults) break;
    }

    pageToken = leads.length < maxResults ? data.nextPageToken : undefined;

    if (pageToken) {
      // A API exige um pequeno intervalo antes que o próximo pageToken
      // se torne válido.
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } while (pageToken && leads.length < maxResults);

  return leads;
}
