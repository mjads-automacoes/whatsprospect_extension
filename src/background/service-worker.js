// Service worker do WhatsProspect.
//
// Orquestra o job de scraping automatizado do Google Maps: abre/navega uma
// aba dedicada pelas combinações cidade x variação, recebe leads extraídos
// pelo content script (src/content/maps-scraper.js) e decide o próximo
// passo. Todo o estado do job vive em chrome.storage.local (ver
// src/lib/mapsJob.js) porque o Chrome pode encerrar este service worker a
// qualquer momento entre uma mensagem e outra — nada relevante pode
// depender de variáveis em memória.

import {
  getJob,
  saveJob,
  clearJob,
  createJob,
  buildCombos,
  buildMapsSearchUrl,
  currentCombo,
  isFinished,
  JOB_STATUS,
} from '../lib/mapsJob.js';
import { formatBrazilianPhone, isValidBrazilianPhone } from '../lib/phoneUtils.js';
import { dedupeKey } from '../lib/dedupe.js';
import { getHistory, addLeadsToHistory, getSettings } from '../lib/storage.js';
import { upsertLeads } from '../lib/supabaseLeads.js';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[WhatsProspect] Extensão instalada.');
  }
});

async function navigateJobTab(job) {
  const combo = currentCombo(job);
  if (!combo) return job;
  const url = buildMapsSearchUrl(combo);

  if (job.tabId == null) {
    const tab = await chrome.tabs.create({ url, active: true });
    job.tabId = tab.id;
  } else {
    await chrome.tabs.update(job.tabId, { url, active: true });
  }
  return saveJob(job);
}

async function startJob(payload) {
  const { cidades, variacoes, quantidade, somenteComTelefone, ignorarHistorico } = payload;
  const combos = buildCombos(cidades, variacoes);
  const job = createJob({
    combos,
    target: quantidade,
    somenteComTelefone,
    ignorarHistorico,
  });
  await saveJob(job);
  await navigateJobTab(job);
  return { ok: true };
}

async function cancelJob() {
  const job = await getJob();
  if (!job) return { ok: true };
  job.status = JOB_STATUS.CANCELADO;
  await saveJob(job);
  return { ok: true };
}

async function resumeJob() {
  let job = await getJob();
  if (!job || job.status !== JOB_STATUS.PAUSED_BLOCKED) return { ok: false };
  job.status = JOB_STATUS.RUNNING;
  job = await saveJob(job);
  await navigateJobTab(job);
  return { ok: true };
}

async function handleContentScriptReady(senderTabId) {
  const job = await getJob();
  if (!job || job.status !== JOB_STATUS.RUNNING || job.tabId !== senderTabId) {
    return { shouldRun: false };
  }
  return {
    shouldRun: true,
    remainingTarget: job.target - job.leads.length,
    combo: currentCombo(job),
  };
}

async function handleLeadFound(rawLead, senderTabId) {
  const job = await getJob();
  if (!job || job.status !== JOB_STATUS.RUNNING || job.tabId !== senderTabId) {
    console.log('[WhatsProspect] Lead recebido mas ignorado: nenhum job rodando para esta aba.', rawLead.nome);
    return;
  }

  if (job.somenteComTelefone && !isValidBrazilianPhone(rawLead.telefoneCru)) {
    console.log(
      '[WhatsProspect] Lead descartado por falta de telefone válido:',
      rawLead.nome,
      'telefoneCru =',
      JSON.stringify(rawLead.telefoneCru)
    );
    return;
  }

  const combo = currentCombo(job);
  const telefone = formatBrazilianPhone(rawLead.telefoneCru) || rawLead.telefoneCru || '';
  const lead = {
    ...rawLead,
    telefone,
    cidade: rawLead.cidade || combo?.cidade || '',
    palavraChave: combo?.variacao || '',
  };

  const key = dedupeKey(lead);
  if (job.seenKeys.includes(key)) {
    console.log('[WhatsProspect] Lead descartado por duplicidade nesta busca:', lead.nome);
    return;
  }

  if (job.ignorarHistorico) {
    const history = await getHistory();
    if (history[key]) {
      console.log('[WhatsProspect] Lead descartado: já estava no histórico:', lead.nome);
      return;
    }
  }

  console.log('[WhatsProspect] Lead aceito e adicionado à lista:', lead.nome, lead.telefone);
  job.seenKeys.push(key);
  job.leads.push(lead);
  await saveJob(job);
}

async function syncLeadsToSupabase(job) {
  try {
    const settings = await getSettings();
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) return;

    const leadsWithKeys = job.leads.map((lead) => ({ key: dedupeKey(lead), lead }));
    await upsertLeads(
      { supabaseUrl: settings.supabaseUrl, anonKey: settings.supabaseAnonKey },
      leadsWithKeys
    );
  } catch (error) {
    console.warn('[WhatsProspect] Falha ao sincronizar leads com o Supabase:', error.message);
  }
}

async function handleQueryDone(senderTabId) {
  const job = await getJob();
  if (!job || job.status !== JOB_STATUS.RUNNING || job.tabId !== senderTabId) return;

  job.comboIndex += 1;

  if (isFinished(job)) {
    job.status = JOB_STATUS.CONCLUIDO;
    await saveJob(job);
    const leadsWithKeys = job.leads.map((lead) => ({ key: dedupeKey(lead), lead }));
    await addLeadsToHistory(leadsWithKeys);
    await syncLeadsToSupabase(job);
    return;
  }

  await saveJob(job);
  // Não espera a sincronização com o Supabase terminar antes de navegar
  // pra próxima combinação — mesmo com timeout, uma rede lenta faria a
  // busca inteira esperar a cada combinação. A sincronização roda em
  // paralelo; se falhar, só loga um aviso (ver syncLeadsToSupabase).
  syncLeadsToSupabase(job);
  await navigateJobTab(job);
}

async function handleBlocked(senderTabId) {
  const job = await getJob();
  if (!job || job.tabId !== senderTabId) return;
  job.status = JOB_STATUS.PAUSED_BLOCKED;
  await saveJob(job);
  await chrome.tabs.update(job.tabId, { active: true });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const job = await getJob();
  if (job && job.tabId === tabId && job.status === JOB_STATUS.RUNNING) {
    job.status = JOB_STATUS.CANCELADO;
    await saveJob(job);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message?.type) {
    case 'START_MAPS_JOB':
      startJob(message.payload).then(sendResponse);
      return true;

    case 'CANCEL_MAPS_JOB':
      cancelJob().then(sendResponse);
      return true;

    case 'RESUME_MAPS_JOB':
      resumeJob().then(sendResponse);
      return true;

    case 'CLEAR_MAPS_JOB':
      clearJob().then(() => sendResponse({ ok: true }));
      return true;

    case 'MAPS_CS_READY':
      handleContentScriptReady(tabId).then(sendResponse);
      return true;

    case 'MAPS_LEAD_FOUND':
      handleLeadFound(message.lead, tabId).then(() => sendResponse({ ok: true }));
      return true;

    case 'MAPS_QUERY_DONE':
      handleQueryDone(tabId).then(() => sendResponse({ ok: true }));
      return true;

    case 'MAPS_BLOCKED':
      handleBlocked(tabId).then(() => sendResponse({ ok: true }));
      return true;

    case 'SEND_TO_WEBHOOK':
      // Reservado para integração futura: Google Sheets -> N8N -> CRM -> WhatsApp.
      sendResponse({ ok: false, error: 'Integração com N8N/Google Sheets ainda não implementada.' });
      return false;

    default:
      return false;
  }
});
