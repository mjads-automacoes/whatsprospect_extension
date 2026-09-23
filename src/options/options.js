import { getSettings, saveSettings, historyCount, clearHistory } from '../lib/storage.js';

const els = {
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleVisibilityBtn: document.getElementById('toggleVisibilityBtn'),
  saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
  apiKeyStatus: document.getElementById('apiKeyStatus'),
  historyCount: document.getElementById('historyCount'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
};

async function loadSettings() {
  const settings = await getSettings();
  els.apiKeyInput.value = settings.apiKey || '';
  els.historyCount.textContent = await historyCount();
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

els.clearHistoryBtn.addEventListener('click', async () => {
  if (!confirm('Tem certeza que deseja limpar todo o histórico de prospecção?')) return;
  await clearHistory();
  els.historyCount.textContent = '0';
});

loadSettings();
