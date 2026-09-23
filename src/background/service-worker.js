// Service worker do WhatsProspect.
//
// A busca de leads roda diretamente no popup (ver src/popup/popup.js) para
// manter o fluxo simples nesta versão inicial. Este arquivo fica reservado
// para funcionalidades futuras que dependem de um contexto persistente,
// como: reprospecção agendada (chrome.alarms) e envio automático de novos
// leads para um webhook do N8N / Google Sheets.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[WhatsProspect] Extensão instalada. Configure sua chave da Google Places API em Opções.');
  }
});

// Placeholder para integração futura: Google Sheets -> N8N -> CRM -> WhatsApp.
// Quando implementado, este listener receberá uma mensagem do popup com os
// leads exportados e fará o POST para `settings.sheetsWebhookUrl`.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SEND_TO_WEBHOOK') {
    sendResponse({ ok: false, error: 'Integração com N8N/Google Sheets ainda não implementada.' });
    return false;
  }
  return false;
});
