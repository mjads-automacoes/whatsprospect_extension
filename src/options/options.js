import { getSettings, saveSettings, historyCount, clearHistory } from '../lib/storage.js';
import { connect, disconnect, ensureValidManagementToken } from '../lib/supabaseConnect.js';
import {
  listOrganizations,
  createProject,
  waitForProjectActive,
  runSql,
  getApiKeys,
  pickPublicApiKey,
  generateDbPassword,
} from '../lib/supabaseManagementApi.js';
import { SCHEMA_SQL } from '../lib/supabaseSchema.js';

const els = {
  historyCount: document.getElementById('historyCount'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  supabaseUrlInput: document.getElementById('supabaseUrlInput'),
  supabaseAnonKeyInput: document.getElementById('supabaseAnonKeyInput'),
  toggleSupabaseKeyBtn: document.getElementById('toggleSupabaseKeyBtn'),
  saveSupabaseBtn: document.getElementById('saveSupabaseBtn'),
  supabaseStatus: document.getElementById('supabaseStatus'),
  disconnectedView: document.getElementById('disconnectedView'),
  connectedView: document.getElementById('connectedView'),
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  provisionSteps: document.getElementById('provisionSteps'),
};

async function renderConnectionState() {
  const settings = await getSettings();
  const isConnected = Boolean(settings.supabaseUrl && settings.supabaseAnonKey);
  els.disconnectedView.classList.toggle('hidden', isConnected);
  els.connectedView.classList.toggle('hidden', !isConnected);
}

async function loadSettings() {
  const settings = await getSettings();
  els.supabaseUrlInput.value = settings.supabaseUrl || '';
  els.supabaseAnonKeyInput.value = settings.supabaseAnonKey || '';
  els.historyCount.textContent = await historyCount();
  await renderConnectionState();
}

els.toggleSupabaseKeyBtn.addEventListener('click', () => {
  const isPassword = els.supabaseAnonKeyInput.type === 'password';
  els.supabaseAnonKeyInput.type = isPassword ? 'text' : 'password';
  els.toggleSupabaseKeyBtn.textContent = isPassword ? 'Ocultar' : 'Mostrar';
});

els.saveSupabaseBtn.addEventListener('click', async () => {
  const supabaseUrl = els.supabaseUrlInput.value.trim().replace(/\/$/, '');
  const supabaseAnonKey = els.supabaseAnonKeyInput.value.trim();
  try {
    await saveSettings({ supabaseUrl, supabaseAnonKey });
    els.supabaseStatus.textContent = 'Configuração salva.';
    els.supabaseStatus.classList.remove('error');
    await renderConnectionState();
  } catch (error) {
    els.supabaseStatus.textContent = `Erro ao salvar: ${error.message}`;
    els.supabaseStatus.classList.add('error');
  }
});

els.clearHistoryBtn.addEventListener('click', async () => {
  if (!confirm('Tem certeza que deseja limpar todo o histórico de prospecção?')) return;
  await clearHistory();
  els.historyCount.textContent = '0';
});

function addProvisionStep(label) {
  els.provisionSteps.classList.remove('hidden');
  const row = document.createElement('div');
  row.className = 'provision-step';
  row.innerHTML = `<span class="icon">⏳</span><span class="text">${label}</span>`;
  els.provisionSteps.appendChild(row);
  return {
    success(extra) {
      row.querySelector('.icon').textContent = '✅';
      if (extra) row.querySelector('.text').textContent += ` — ${extra}`;
    },
    error(message) {
      row.classList.add('error');
      row.querySelector('.icon').textContent = '❌';
      row.querySelector('.text').textContent += ` — ${message}`;
    },
  };
}

els.connectBtn.addEventListener('click', async () => {
  els.connectBtn.disabled = true;
  els.provisionSteps.innerHTML = '';
  els.provisionSteps.classList.remove('hidden');
  els.supabaseStatus.textContent = '';
  els.supabaseStatus.classList.remove('error');

  const stepConnect = addProvisionStep('Conectando com sua conta Supabase...');
  let accessToken;
  try {
    await connect();
    accessToken = await ensureValidManagementToken();
    if (!accessToken) throw new Error('Não foi possível obter acesso à sua conta.');
    stepConnect.success();
  } catch (error) {
    stepConnect.error(error.message);
    els.connectBtn.disabled = false;
    return;
  }

  const stepOrg = addProvisionStep('Localizando sua organização...');
  let org;
  try {
    const orgs = await listOrganizations(accessToken);
    if (!orgs.length) throw new Error('Nenhuma organização encontrada na sua conta.');
    org = orgs[0];
    stepOrg.success(org.name || org.slug || org.id);
  } catch (error) {
    stepOrg.error(error.message);
    els.connectBtn.disabled = false;
    return;
  }

  let ref;
  const stepCreate = addProvisionStep('Criando seu banco de dados...');
  try {
    const project = await createProject(accessToken, {
      name: 'whatsprospect',
      organizationSlug: org.slug || org.id,
      dbPass: generateDbPassword(),
    });
    ref = project.id || project.ref;
    stepCreate.success();
  } catch (error) {
    stepCreate.error(error.message);
    els.connectBtn.disabled = false;
    return;
  }

  const stepActive = addProvisionStep('Aguardando o banco ficar pronto (pode levar ~2 minutos)...');
  try {
    await waitForProjectActive(accessToken, ref);
    stepActive.success();
  } catch (error) {
    stepActive.error(error.message);
    els.connectBtn.disabled = false;
    return;
  }

  const stepSql = addProvisionStep('Preparando a tabela de leads...');
  try {
    await runSql(accessToken, ref, SCHEMA_SQL);
    stepSql.success();
  } catch (error) {
    stepSql.error(error.message);
    // Continua mesmo assim — as chaves já são úteis para configuração manual.
  }

  const stepKeys = addProvisionStep('Finalizando...');
  try {
    const apiKeys = await getApiKeys(accessToken, ref);
    const anonKey = pickPublicApiKey(apiKeys);
    if (!anonKey) throw new Error('Nenhuma chave pública encontrada na resposta.');

    const supabaseUrl = `https://${ref}.supabase.co`;
    await saveSettings({ supabaseUrl, supabaseAnonKey: anonKey });
    els.supabaseUrlInput.value = supabaseUrl;
    els.supabaseAnonKeyInput.value = anonKey;
    stepKeys.success();
  } catch (error) {
    stepKeys.error(error.message);
    els.connectBtn.disabled = false;
    return;
  }

  els.supabaseStatus.textContent = 'Tudo pronto! Os leads encontrados agora são salvos na nuvem automaticamente.';
  els.connectBtn.disabled = false;
  await renderConnectionState();
});

els.disconnectBtn.addEventListener('click', async () => {
  if (!confirm('Desconectar? Os leads já sincronizados continuam no seu Supabase, mas novas buscas não serão mais enviadas pra lá.')) return;
  await disconnect();
  await saveSettings({ supabaseUrl: '', supabaseAnonKey: '' });
  els.supabaseUrlInput.value = '';
  els.supabaseAnonKeyInput.value = '';
  els.provisionSteps.classList.add('hidden');
  els.provisionSteps.innerHTML = '';
  els.supabaseStatus.textContent = '';
  await renderConnectionState();
});

loadSettings();
