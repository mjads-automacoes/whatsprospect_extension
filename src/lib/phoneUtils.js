// Normalização e validação de telefones brasileiros.

/**
 * Extrai apenas dígitos de um telefone.
 */
function digitsOnly(phone) {
  return (phone || '').replace(/\D/g, '');
}

/**
 * Reduz qualquer telefone brasileiro para os 10 ou 11 dígitos "locais"
 * (DDD + número, sem código do país nem prefixo de discagem), removendo:
 *  - código do país (55), quando presente;
 *  - o "0" de prefixo de discagem interurbana (comum em números como o
 *    Google Maps mostra, ex.: 041992902391), quando presente.
 * Retorna null se não sobrar um número de 10 ou 11 dígitos reconhecível.
 */
function normalizeLocalDigits(rawPhone) {
  let digits = digitsOnly(rawPhone);
  if (!digits) return null;

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  } else if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10 || digits.length === 11) {
    return digits;
  }

  return null;
}

/**
 * Normaliza um telefone brasileiro para o formato:
 *  - Celular: +55 (XX) 9XXXX-XXXX
 *  - Fixo:    +55 (XX) XXXX-XXXX
 * Retorna null se não for possível reconhecer um telefone válido.
 */
export function formatBrazilianPhone(rawPhone) {
  const digits = normalizeLocalDigits(rawPhone);
  if (!digits) return null;

  const ddd = digits.slice(0, 2);
  const first = digits.length === 11 ? digits.slice(2, 7) : digits.slice(2, 6);
  const second = digits.length === 11 ? digits.slice(7, 11) : digits.slice(6, 10);
  return `+55 (${ddd}) ${first}-${second}`;
}

/**
 * Retorna uma chave canônica (apenas dígitos, com DDI 55) usada para
 * deduplicação. Retorna null se o telefone não for reconhecível.
 */
export function canonicalPhoneKey(rawPhone) {
  const digits = normalizeLocalDigits(rawPhone);
  return digits ? `55${digits}` : null;
}

export function isValidBrazilianPhone(rawPhone) {
  return canonicalPhoneKey(rawPhone) !== null;
}
