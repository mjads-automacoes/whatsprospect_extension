import { getSettings, saveSettings, historyCount, clearHistory } from '../lib/storage.js';
import { getRedirectUrl } from '../lib/supabaseAuth.js';
import {
  listOrganizations,
  createProject,
  waitForProjectActive,
  runSql,
  getApiKeys,
  pickPublicApiKey,
  addRedirectUrl,
  configureGoogleProvider,
  generateDbPassword,
} from '../lib/supabaseManagementApi.js';
import { SCHEMA_SQL } from '../lib/supabaseSchema.js';

const els = {
  historyCount: document.getElementById('historyCount'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  redirectUrlBox: document.getElementById('redirectUrlBox'),
  supabaseUrlInput: document.getElementById('supabaseUrlInput'),
  supabaseAnonKeyInput: document.getElementById('supabaseAnonKeyInput'),
  toggleSupabaseKeyBtn: document.getElementById('toggleSupabaseKeyBtn'),
  saveSupabaseBtn: document.getElementById('saveSupabaseBtn'),
  supabaseStatus: document.getElementById('supabaseStatus'),
  patInput: document.getElementById('patInput'),
  orgSelect: document.getElementById('orgSelect'),
  projectNameInput: document.getElementById('projectNameInput'),
  googleClientIdInput: document.getElementById('googleClientIdInput'),
  googleClientSecretInput: document.getElementById('googleClientSecretInput'),
  provisionBtn: document.getElementById('provisionBtn'),
  provisionSteps: document.getElementById('provisionSteps'),
};

async function loadSettings() {
  const settings = await getSettings();
  els.supabaseUrlInput.value = settings.supabaseUrl || '';
  els.supabaseAnonKeyInput.value = settings.supabaseAnonKey || '';
  els.historyCount.textContent = await historyCount();
  els.redirectUrlBox.textContent = getRedirectUrl();
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
    els.supabaseStatus.textContent = 'Configuração salva. Volte ao popup para entrar com Google.';
    els.supabaseStatus.classList.remove('error');
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

let loadedOrgs = [];

async function loadOrganizations() {
  const pat = els.patInput.value.trim();
  els.orgSelect.innerHTML = '<option value="">Carregando...</option>';
  if (!pat) {
    els.orgSelect.innerHTML = '<option value="">Cole o token acima para carregar</option>';
    return;
  }
  try {
    loadedOrgs = await listOrganizations(pat);
    if (!loadedOrgs.length) {
      els.orgSelect.innerHTML = '<option value="">Nenhuma organização encontrada</option>';
      return;
    }
    els.orgSelect.innerHTML = loadedOrgs
      .map((org, i) => `<option value="${i}">${org.name || org.slug || org.id}</option>`)
      .join('');
  } catch (error) {
    els.orgSelect.innerHTML = `<option value="">Erro: ${error.message}</option>`;
  }
}

els.patInput.addEventListener('blur', loadOrganizations);

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

els.provisionBtn.addEventListener('click', async () => {
  const pat = els.patInput.value.trim();
  const org = loadedOrgs[Number(els.orgSelect.value)];
  const projectName = els.projectNameInput.value.trim() || 'whatsprospect';
  const googleClientId = els.googleClientIdInput.value.trim();
  const googleClientSecret = els.googleClientSecretInput.value.trim();
  const redirectUrl = getRedirectUrl();

  if (!pat || !org) {
    alert('Cole o Personal Access Token e selecione uma organização primeiro.');
    return;
  }

  els.provisionBtn.disabled = true;
  els.provisionSteps.innerHTML = '';

  let ref;
  let anonKey;

  const stepCreate = addProvisionStep('Criando projeto...');
  try {
    const project = await createProject(pat, {
      name: projectName,
      organizationSlug: org.slug || org.id,
      dbPass: generateDbPassword(),
    });
    ref = project.id || project.ref;
    stepCreate.success(ref);
  } catch (error) {
    stepCreate.error(error.message);
    els.provisionBtn.disabled = false;
    return;
  }

  const stepActive = addProvisionStep('Aguardando o projeto ficar ativo (pode levar ~2 minutos)...');
  try {
    await waitForProjectActive(pat, ref);
    stepActive.success();
  } catch (error) {
    stepActive.error(error.message);
    els.provisionBtn.disabled = false;
    return;
  }

  const stepSql = addProvisionStep('Criando a tabela de leads (schema.sql)...');
  try {
    await runSql(pat, ref, SCHEMA_SQL);
    stepSql.success();
  } catch (error) {
    stepSql.error(error.message);
    // Continua mesmo assim — o resto do provisionamento ainda é útil.
  }

  const stepKeys = addProvisionStep('Buscando as chaves da API...');
  try {
    const apiKeys = await getApiKeys(pat, ref);
    anonKey = pickPublicApiKey(apiKeys);
    if (!anonKey) throw new Error('Nenhuma chave pública encontrada na resposta.');
    stepKeys.success();

    const supabaseUrl = `https://${ref}.supabase.co`;
    await saveSettings({ supabaseUrl, supabaseAnonKey: anonKey });
    els.supabaseUrlInput.value = supabaseUrl;
    els.supabaseAnonKeyInput.value = anonKey;
  } catch (error) {
    stepKeys.error(error.message);
    els.provisionBtn.disabled = false;
    return;
  }

  const stepRedirect = addProvisionStep('Registrando a URL de redirecionamento...');
  try {
    await addRedirectUrl(pat, ref, redirectUrl);
    stepRedirect.success();
  } catch (error) {
    stepRedirect.error(`${error.message} — adicione manualmente em Authentication → URL Configuration.`);
  }

  if (googleClientId && googleClientSecret) {
    const stepGoogle = addProvisionStep('Configurando o provedor Google...');
    try {
      await configureGoogleProvider(pat, ref, { clientId: googleClientId, clientSecret: googleClientSecret });
      stepGoogle.success();
    } catch (error) {
      stepGoogle.error(`${error.message} — configure manualmente em Authentication → Providers → Google.`);
    }
  }

  els.supabaseStatus.textContent = 'Provisionamento concluído. Volte ao popup e clique em "Entrar com Google".';
  els.supabaseStatus.classList.remove('error');
  els.provisionBtn.disabled = false;
});

loadSettings();
