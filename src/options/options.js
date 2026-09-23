import { getSettings, saveSettings, historyCount, clearHistory } from '../lib/storage.js';
import { getRedirectUrl } from '../lib/supabaseAuth.js';

const els = {
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleVisibilityBtn: document.getElementById('toggleVisibilityBtn'),
  saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
  apiKeyStatus: document.getElementById('apiKeyStatus'),
  historyCount: document.getElementById('historyCount'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  redirectUrlBox: document.getElementById('redirectUrlBox'),
  supabaseUrlInput: document.getElementById('supabaseUrlInput'),
  supabaseAnonKeyInput: document.getElementById('supabaseAnonKeyInput'),
  toggleSupabaseKeyBtn: document.getElementById('toggleSupabaseKeyBtn'),
  saveSupabaseBtn: document.getElementById('saveSupabaseBtn'),
  supabaseStatus: document.getElementById('supabaseStatus'),
};

async function loadSettings() {
  const settings = await getSettings();
  els.apiKeyInput.value = settings.apiKey || '';
  els.supabaseUrlInput.value = settings.supabaseUrl || '';
  els.supabaseAnonKeyInput.value = settings.supabaseAnonKey || '';
  els.historyCount.textContent = await historyCount();
  els.redirectUrlBox.textContent = getRedirectUrl();
}

els.toggleVisibilityBtn.addEventListener('click', () => {
  const isPassword = els.apiKeyInput.type === 'password';
  els.apiKeyInput.type = isPassword ? 'text' : 'password';
  els.toggleVisibilityBtn.textContent = isPassword ? 'Ocultar' : 'Mostrar';
});

els.saveApiKeyBtn.addEventListener('click', async () => {
  const apiKey = els.apiKeyInput.value.trim();
  try {
    await saveSettings({ apiKey });
    els.apiKeyStatus.textContent = 'Chave salva com sucesso.';
    els.apiKeyStatus.classList.remove('error');
  } catch (error) {
    els.apiKeyStatus.textContent = `Erro ao salvar: ${error.message}`;
    els.apiKeyStatus.classList.add('error');
  }
});

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

loadSettings();
