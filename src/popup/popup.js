import { generateKeywordVariations } from '../lib/keywordVariations.js';
import { getJob, JOB_KEY, JOB_STATUS, currentCombo } from '../lib/mapsJob.js';
import { leadsToCsv, buildCsvFileName } from '../lib/csv.js';
import { getSettings } from '../lib/storage.js';

const els = {
  openOptionsBtn: document.getElementById('openOptionsBtn'),
  syncStatus: document.getElementById('syncStatus'),
  form: document.getElementById('searchForm'),
  segmentoInput: document.getElementById('segmentoInput'),
  cidadesInput: document.getElementById('cidadesInput'),
  quantidadeInput: document.getElementById('quantidadeInput'),
  somenteTelefoneCheck: document.getElementById('somenteTelefoneCheck'),
  ignorarHistoricoCheck: document.getElementById('ignorarHistoricoCheck'),
  gerarVariacoesBtn: document.getElementById('gerarVariacoesBtn'),
  variacoesContainer: document.getElementById('variacoesContainer'),
  variacoesList: document.getElementById('variacoesList'),
  novaVariacaoInput: document.getElementById('novaVariacaoInput'),
  addVariacaoBtn: document.getElementById('addVariacaoBtn'),
  buscarBtn: document.getElementById('buscarBtn'),
  jobControls: document.getElementById('jobControls'),
  cancelJobBtn: document.getElementById('cancelJobBtn'),
  resumeJobBtn: document.getElementById('resumeJobBtn'),
  statusArea: document.getElementById('statusArea'),
  resultsSection: document.getElementById('resultsSection'),
  resultsCount: document.getElementById('resultsCount'),
  resultsTableBody: document.getElementById('resultsTableBody'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
};

let currentVariations = [];
let lastJob = null;

function parseCidades(raw) {
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function renderVariacoes() {
  els.variacoesList.innerHTML = '';
  currentVariations.forEach((variacao, index) => {
    const row = document.createElement('label');
    row.className = 'variacao-item';
    row.innerHTML = `
      <input type="checkbox" data-index="${index}" checked />
      <span>${variacao}</span>
    `;
    els.variacoesList.appendChild(row);
  });
  els.variacoesContainer.classList.toggle('hidden', currentVariations.length === 0);
  updateBuscarBtnState();
}

function getSelectedVariacoes() {
  const checkboxes = els.variacoesList.querySelectorAll('input[type="checkbox"]');
  const selected = [];
  checkboxes.forEach((cb) => {
    if (cb.checked) selected.push(currentVariations[Number(cb.dataset.index)]);
  });
  return selected;
}

function isJobActive(job) {
  return job && (job.status === JOB_STATUS.RUNNING || job.status === JOB_STATUS.PAUSED_BLOCKED);
}

function updateBuscarBtnState() {
  if (isJobActive(lastJob)) {
    els.buscarBtn.disabled = true;
    return;
  }
  const hasSegmento = els.segmentoInput.value.trim().length > 0;
  const hasCidades = parseCidades(els.cidadesInput.value).length > 0;
  const hasVariacoes = getSelectedVariacoes().length > 0;
  els.buscarBtn.disabled = !(hasSegmento && hasCidades && hasVariacoes);
}

function setStatus(text, isError = false) {
  els.statusArea.classList.remove('hidden');
  els.statusArea.classList.toggle('error', isError);
  els.statusArea.textContent = text;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function renderResultsTable(leads) {
  els.resultsSection.classList.toggle('hidden', leads.length === 0);
  els.resultsCount.textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'} encontrado${leads.length === 1 ? '' : 's'}`;
  els.resultsTableBody.innerHTML = '';
  for (const lead of leads) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td title="${escapeHtml(lead.nome)}">${escapeHtml(lead.nome)}</td>
      <td>${escapeHtml(lead.telefone)}</td>
      <td>${escapeHtml(lead.cidade)}</td>
      <td>${escapeHtml(lead.estado)}</td>
      <td title="${escapeHtml(lead.categoria)}">${escapeHtml(lead.categoria)}</td>
      <td title="${escapeHtml(lead.site)}">${escapeHtml(lead.site)}</td>
    `;
    els.resultsTableBody.appendChild(tr);
  }
}

function statusMessageFor(job) {
  if (!job) return '';
  switch (job.status) {
    case JOB_STATUS.RUNNING: {
      const combo = currentCombo(job);
      const posicao = `${Math.min(job.comboIndex + 1, job.combos.length)}/${job.combos.length}`;
      const query = combo ? `${combo.variacao} em ${combo.cidade}` : '...';
      return `Buscando (${posicao}): ${query}\n${job.leads.length} lead(s) encontrados até agora.`;
    }
    case JOB_STATUS.PAUSED_BLOCKED:
      return 'O Google mostrou uma verificação anti-robô na aba do Maps. Resolva manualmente na aba aberta e clique em "Retomar após verificação".';
    case JOB_STATUS.CONCLUIDO:
      return `Busca concluída: ${job.leads.length} lead(s) encontrados.`;
    case JOB_STATUS.CANCELADO:
      return `Busca cancelada. ${job.leads.length} lead(s) coletados até o cancelamento.`;
    case JOB_STATUS.ERRO:
      return `Busca interrompida por erro: ${job.lastError || 'desconhecido'}`;
    default:
      return '';
  }
}

function renderJobState(job) {
  lastJob = job;

  const active = isJobActive(job);
  els.jobControls.classList.toggle('hidden', !active);
  els.resumeJobBtn.classList.toggle('hidden', job?.status !== JOB_STATUS.PAUSED_BLOCKED);
  els.cancelJobBtn.classList.toggle('hidden', job?.status !== JOB_STATUS.RUNNING);

  if (job) {
    setStatus(statusMessageFor(job), job.status === JOB_STATUS.ERRO);
    renderResultsTable(job.leads || []);
  }

  if (active) {
    els.buscarBtn.textContent = 'Busca em andamento...';
  } else {
    els.buscarBtn.textContent = 'Buscar leads';
  }
  updateBuscarBtnState();
}

els.openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

els.segmentoInput.addEventListener('input', updateBuscarBtnState);
els.cidadesInput.addEventListener('input', updateBuscarBtnState);
els.variacoesList.addEventListener('change', updateBuscarBtnState);

els.gerarVariacoesBtn.addEventListener('click', () => {
  const segmento = els.segmentoInput.value.trim();
  if (!segmento) {
    setStatus('Informe o segmento/palavra-chave antes de gerar variações.', true);
    return;
  }
  currentVariations = generateKeywordVariations(segmento);
  renderVariacoes();
});

els.addVariacaoBtn.addEventListener('click', () => {
  const value = els.novaVariacaoInput.value.trim();
  if (!value) return;
  if (!currentVariations.includes(value)) {
    currentVariations.push(value);
    renderVariacoes();
  }
  els.novaVariacaoInput.value = '';
});

els.novaVariacaoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    els.addVariacaoBtn.click();
  }
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isJobActive(lastJob)) return;

  const cidades = parseCidades(els.cidadesInput.value);
  const quantidade = Math.max(1, Number(els.quantidadeInput.value) || 1);
  const variacoes = getSelectedVariacoes();

  if (!variacoes.length) {
    setStatus('Selecione ao menos uma variação da palavra-chave.', true);
    return;
  }

  const payload = {
    cidades,
    variacoes,
    quantidade,
    somenteComTelefone: els.somenteTelefoneCheck.checked,
    ignorarHistorico: els.ignorarHistoricoCheck.checked,
  };

  setStatus('Iniciando busca automatizada no Google Maps... uma nova aba será aberta.');
  await chrome.runtime.sendMessage({ type: 'START_MAPS_JOB', payload });
});

els.cancelJobBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CANCEL_MAPS_JOB' });
});

els.resumeJobBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'RESUME_MAPS_JOB' });
});

els.exportCsvBtn.addEventListener('click', () => {
  const leads = lastJob?.leads || [];
  if (!leads.length) return;

  const csv = leadsToCsv(leads);
  const fileName = buildCsvFileName({
    segmento: els.segmentoInput.value,
    cidades: parseCidades(els.cidadesInput.value),
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({ url, filename: fileName, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
});

async function renderSyncStatus() {
  const settings = await getSettings();
  els.syncStatus.textContent = settings.supabaseUrl
    ? '☁️ Sincronizando leads na nuvem'
    : 'Leads salvos só neste navegador (conecte a nuvem em Opções)';
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[JOB_KEY]) {
    renderJobState(changes[JOB_KEY].newValue || null);
  }
  renderSyncStatus();
});

getJob().then(renderJobState);
renderSyncStatus();
updateBuscarBtnState();
