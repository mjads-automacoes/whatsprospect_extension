// Normalização e validação de telefones brasileiros.

/**
 * Extrai apenas dígitos de um telefone.
 */
function digitsOnly(phone) {
  return (phone || '').replace(/\D/g, '');
}

/**
 * Normaliza um telefone brasileiro para o formato:
 *  - Celular: +55 (XX) 9XXXX-XXXX
 *  - Fixo:    +55 (XX) XXXX-XXXX
 * Retorna null se não for possível reconhecer um telefone válido.
 */
export function formatBrazilianPhone(rawPhone) {
  let digits = digitsOnly(rawPhone);
  if (!digits) return null;

  // Remove código do país se presente (55)
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith('55')) {
      digits = digits.slice(2);
    }
  }

  // Agora esperamos DDD (2 dígitos) + número (8 ou 9 dígitos)
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const first = digits.slice(2, 6);
    const second = digits.slice(6, 10);
    return `+55 (${ddd}) ${first}-${second}`;
  }

  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const first = digits.slice(2, 7);
    const second = digits.slice(7, 11);
    return `+55 (${ddd}) ${first}-${second}`;
  }

  return null;
}

/**
 * Retorna uma chave canônica (apenas dígitos, com DDI 55) usada para
 * deduplicação. Retorna null se o telefone não for reconhecível.
 */
export function canonicalPhoneKey(rawPhone) {
  let digits = digitsOnly(rawPhone);
  if (!digits) return null;

  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  if (digits.length === 12 || digits.length === 13) {
    if (!digits.startsWith('55')) return null;
    return digits;
  }

  return null;
}

export function isValidBrazilianPhone(rawPhone) {
  return canonicalPhoneKey(rawPhone) !== null;
}
