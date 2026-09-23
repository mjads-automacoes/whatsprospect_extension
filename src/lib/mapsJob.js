// Estado do job de scraping automatizado do Google Maps.
// Persistido em chrome.storage.local para sobreviver a reinícios do
// service worker (que o Chrome pode encerrar após ~30s de inatividade).

export const JOB_KEY = 'whatsprospect.mapsJob';

export const JOB_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED_BLOCKED: 'paused_blocked',
  CONCLUIDO: 'concluido',
  CANCELADO: 'cancelado',
  ERRO: 'erro',
};

export function buildCombos(cidades, variacoes) {
  const combos = [];
  for (const cidade of cidades) {
    for (const variacao of variacoes) {
      combos.push({ cidade, variacao });
    }
  }
  return combos;
}

export function buildMapsSearchUrl({ cidade, variacao }) {
  const query = `${variacao} em ${cidade}`;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/`;
}

export async function getJob() {
  const stored = await chrome.storage.local.get(JOB_KEY);
  return stored[JOB_KEY] || null;
}

export async function saveJob(job) {
  const next = { ...job, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [JOB_KEY]: next });
  return next;
}

export async function clearJob() {
  await chrome.storage.local.remove(JOB_KEY);
}

export function createJob({ combos, target, somenteComTelefone, ignorarHistorico }) {
  return {
    status: JOB_STATUS.RUNNING,
    tabId: null,
    combos,
    comboIndex: 0,
    target,
    somenteComTelefone,
    ignorarHistorico,
    leads: [],
    seenKeys: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastError: null,
  };
}

export function currentCombo(job) {
  return job.combos[job.comboIndex] || null;
}

export function isFinished(job) {
  return job.leads.length >= job.target || job.comboIndex >= job.combos.length;
}
