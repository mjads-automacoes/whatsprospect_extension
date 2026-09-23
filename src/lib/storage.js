// Wrapper sobre chrome.storage.local para configurações e histórico de prospecção.

const SETTINGS_KEY = 'whatsprospect.settings';
const HISTORY_KEY = 'whatsprospect.history';

const DEFAULT_SETTINGS = {
  apiKey: '',
  sheetsWebhookUrl: '', // reservado para integração futura (N8N / Google Sheets)
  supabaseUrl: '',
  supabaseAnonKey: '',
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

export async function saveSettings(partialSettings) {
  const current = await getSettings();
  const next = { ...current, ...partialSettings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getHistory() {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  return stored[HISTORY_KEY] || {};
}

export async function isInHistory(key) {
  const history = await getHistory();
  return Boolean(history[key]);
}

/**
 * Adiciona leads ao histórico para evitar prospectar a mesma empresa
 * novamente em buscas futuras.
 */
export async function addLeadsToHistory(leadsWithKeys) {
  const history = await getHistory();
  const now = new Date().toISOString();
  for (const { key, lead } of leadsWithKeys) {
    history[key] = {
      nome: lead.nome,
      telefone: lead.telefone,
      cidade: lead.cidade,
      prospectadoEm: history[key]?.prospectadoEm || now,
      ultimaVezVisto: now,
    };
  }
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}

export async function clearHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: {} });
}

export async function historyCount() {
  const history = await getHistory();
  return Object.keys(history).length;
}
