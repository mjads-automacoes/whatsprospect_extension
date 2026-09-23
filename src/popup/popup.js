import { generateKeywordVariations } from '../lib/keywordVariations.js';
import { buscarLeads } from '../lib/search.js';
import { getSettings, addLeadsToHistory } from '../lib/storage.js';
import { dedupeKey } from '../lib/dedupe.js';
import { leadsToCsv, buildCsvFileName } from '../lib/csv.js';

const els = {
  apiKeyWarning: document.getElementById('apiKeyWarning'),
  openOptionsBtn: document.getElementById('openOptionsBtn'),
  openOptionsLink: document.getElementById('openOptionsLink'),
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
  statusArea: document.getElementById('statusArea'),
  resultsSection: document.getElementById('resultsSection'),
  resultsCount: document.getElementById('resultsCount'),
  resultsTableBody: document.getElementById('resultsTableBody'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
};

let currentVariations = [];
let lastLeads = [];

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

function updateBuscarBtnState() {
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

function appendStatus(line) {
  els.statusArea.classList.remove('hidden');
  els.statusArea.textContent += `\n${line}`;
  els.statusArea.scrollTop = els.statusArea.scrollHeight;
}

function renderResults(leads) {
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

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

async function checkApiKey() {
  const settings = await getSettings();
  const hasKey = Boolean(settings.apiKey);
  els.apiKeyWarning.classList.toggle('hidden', hasKey);
  return settings;
}

els.openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
els.openOptionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

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

  const settings = await checkApiKey();
  if (!settings.apiKey) {
    setStatus('Configure sua chave da Google Places API em Opções antes de buscar.', true);
    return;
  }

  const segmento = els.segmentoInput.value.trim();
  const cidades = parseCidades(els.cidadesInput.value);
  const quantidade = Math.max(1, Number(els.quantidadeInput.value) || 1);
  const somenteComTelefone = els.somenteTelefoneCheck.checked;
  const ignorarHistorico = els.ignorarHistoricoCheck.checked;
  const variacoes = getSelectedVariacoes();

  if (!variacoes.length) {
    setStatus('Selecione ao menos uma variação da palavra-chave.', true);
    return;
  }

  els.buscarBtn.disabled = true;
  els.buscarBtn.textContent = 'Buscando...';
  setStatus(`Iniciando busca: "${segmento}" em ${cidades.join(', ')}...`);
  renderResults([]);

  try {
    const leads = await buscarLeads(
      {
        apiKey: settings.apiKey,
        variacoes,
        cidades,
        quantidade,
        somenteComTelefone,
        ignorarHistorico,
      },
      (progress) => {
        if (progress.status === 'buscando') {
          appendStatus(`Pesquisando: ${progress.query}`);
        } else if (progress.status === 'lead-encontrado') {
          els.resultsCount.textContent = `${progress.totalEncontrado} lead(s) encontrados...`;
          els.resultsSection.classList.remove('hidden');
        } else if (progress.status === 'erro') {
          appendStatus(`Erro em "${progress.query}": ${progress.mensagem}`);
        } else if (progress.status === 'concluido') {
          appendStatus(`Busca concluída: ${progress.totalEncontrado} lead(s).`);
        }
      }
    );

    lastLeads = leads;
    renderResults(leads);

    const leadsWithKeys = leads.map((lead) => ({ key: dedupeKey(lead), lead }));
    await addLeadsToHistory(leadsWithKeys);
  } catch (error) {
    setStatus(`Erro na busca: ${error.message}`, true);
  } finally {
    els.buscarBtn.disabled = false;
    els.buscarBtn.textContent = 'Buscar leads';
    updateBuscarBtnState();
  }
});

els.exportCsvBtn.addEventListener('click', () => {
  if (!lastLeads.length) return;

  const csv = leadsToCsv(lastLeads);
  const fileName = buildCsvFileName({
    segmento: els.segmentoInput.value,
    cidades: parseCidades(els.cidadesInput.value),
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download(
    {
      url,
      filename: fileName,
      saveAs: true,
    },
    () => {
      // Libera a URL do blob após o início do download.
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  );
});

checkApiKey();
updateBuscarBtnState();
