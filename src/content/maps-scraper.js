// Content script injetado em páginas do Google Maps.
//
// Só age quando existe um job de prospecção ativo (consultado via mensagem
// ao background) e a aba atual é a aba dedicada daquele job. Em qualquer
// outra navegação normal do usuário no Maps, este script não faz nada.
//
// AVISO: automatizar a leitura de dados do Google Maps não é uma forma
// oficialmente suportada pelo Google e pode violar os Termos de Serviço do
// Google. Este script inclui limites de velocidade e detecção de bloqueio
// (CAPTCHA) para reduzir o risco, mas não elimina o risco. Use por sua
// conta e risco, preferencialmente em volume moderado.

(function () {
  const SELECTORS = {
    feed: 'div[role="feed"]',
    detailRoot: 'div[role="main"]',
    phoneButton: 'button[data-item-id^="phone:tel:"]',
    websiteLink: 'a[data-item-id="authority"]',
    addressButton: 'button[data-item-id="address"]',
  };

  const BLOCKED_TEXT_PATTERN =
    /unusual traffic|n[aã]o [eé] um rob[oô]|recaptcha|sistema det?ectou|antes de continuar/i;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomDelay(min, max) {
    return sleep(min + Math.random() * (max - min));
  }

  function isBlockedPage() {
    if (document.querySelector('iframe[src*="recaptcha"]')) return true;
    const bodyText = document.body ? document.body.innerText.slice(0, 2000) : '';
    return BLOCKED_TEXT_PATTERN.test(bodyText) || BLOCKED_TEXT_PATTERN.test(document.title);
  }

  function tryDismissConsentBanner() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const consentBtn = buttons.find((b) => /aceitar tudo|accept all/i.test(b.textContent || ''));
    if (consentBtn) consentBtn.click();
  }

  function getFeed() {
    return document.querySelector(SELECTORS.feed);
  }

  function getCardLinks(feed) {
    if (!feed) return [];
    return Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
  }

  function feedHasEndMarker(feed) {
    if (!feed) return false;
    return /voc[eê] chegou ao final da lista|you've reached the end of the list/i.test(
      feed.innerText || ''
    );
  }

  async function waitForFeed(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      tryDismissConsentBanner();
      if (isBlockedPage()) return null;
      const feed = getFeed();
      if (feed && getCardLinks(feed).length > 0) return feed;
      await sleep(300);
    }
    return getFeed();
  }

  function parseCityState(address) {
    if (!address) return { cidade: '', estado: '' };
    const match = address.match(/([A-Za-zÀ-ÖØ-öø-ÿ'.\s]+?)\s*-\s*([A-Z]{2})(?:,|\s|$)/);
    if (match) {
      return { cidade: match[1].trim(), estado: match[2] };
    }
    return { cidade: '', estado: '' };
  }

  function extractPhoneDigits(phoneButton) {
    if (!phoneButton) return '';
    const itemId = phoneButton.getAttribute('data-item-id') || '';
    const fromItemId = itemId.replace('phone:tel:', '');
    if (fromItemId) return fromItemId;
    const label = phoneButton.getAttribute('aria-label') || '';
    return label.replace(/^[^:]*:\s*/, '');
  }

  async function waitForDetail(previousName, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isBlockedPage()) return null;
      const root = document.querySelector(SELECTORS.detailRoot);
      const h1 = root ? root.querySelector('h1') : document.querySelector('h1');
      const name = h1 ? h1.textContent.trim() : '';
      if (name && name !== previousName) return { root, name };
      await sleep(200);
    }
    return null;
  }

  function extractLeadFromDetail(root, nome) {
    const phoneButton = root ? root.querySelector(SELECTORS.phoneButton) : null;
    const websiteLink = root ? root.querySelector(SELECTORS.websiteLink) : null;
    const addressButton = root ? root.querySelector(SELECTORS.addressButton) : null;

    const endereco = addressButton
      ? (addressButton.getAttribute('aria-label') || '').replace(/^[^:]*:\s*/, '')
      : '';
    const { cidade, estado } = parseCityState(endereco);

    return {
      nome,
      telefoneCru: extractPhoneDigits(phoneButton),
      site: websiteLink ? websiteLink.getAttribute('href') || '' : '',
      endereco,
      cidade,
      estado,
      categoria: '',
      origemLink: window.location.href,
    };
  }

  async function openCardAndExtract(card, previousName) {
    card.scrollIntoView({ block: 'center' });
    card.click();
    const detail = await waitForDetail(previousName);
    if (!detail) return { lead: null, blocked: isBlockedPage() };

    const lead = extractLeadFromDetail(detail.root, detail.name);

    // Volta para a lista de resultados usando o histórico do próprio Maps.
    window.history.back();
    await randomDelay(500, 900);

    return { lead, blocked: false };
  }

  function scrollFeedToBottom(feed) {
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'auto' });
  }

  async function runQuery(remainingTarget) {
    const feed = await waitForFeed();
    if (!feed) {
      if (isBlockedPage()) {
        chrome.runtime.sendMessage({ type: 'MAPS_BLOCKED' });
        return;
      }
      chrome.runtime.sendMessage({ type: 'MAPS_QUERY_DONE', found: 0 });
      return;
    }

    const processedHrefs = new Set();
    let collected = 0;
    let stableRounds = 0;
    let lastDetailName = '';

    while (collected < remainingTarget) {
      const cards = getCardLinks(feed).filter((c) => !processedHrefs.has(c.href));

      for (const card of cards) {
        processedHrefs.add(card.href);

        const { lead, blocked } = await openCardAndExtract(card, lastDetailName);
        if (blocked) {
          chrome.runtime.sendMessage({ type: 'MAPS_BLOCKED' });
          return;
        }
        if (lead) {
          lastDetailName = lead.nome;
          chrome.runtime.sendMessage({ type: 'MAPS_LEAD_FOUND', lead });
          collected += 1;
        }

        if (collected >= remainingTarget) break;
        await randomDelay(700, 1400);
      }

      if (collected >= remainingTarget) break;

      const beforeCount = getCardLinks(feed).length;
      scrollFeedToBottom(feed);
      await randomDelay(1000, 1800);
      const afterCount = getCardLinks(feed).length;

      if (afterCount <= beforeCount || feedHasEndMarker(feed)) {
        stableRounds += 1;
        if (stableRounds >= 2 || feedHasEndMarker(feed)) break;
      } else {
        stableRounds = 0;
      }

      if (processedHrefs.size > 120) break; // limite de segurança por busca
    }

    chrome.runtime.sendMessage({ type: 'MAPS_QUERY_DONE', found: collected });
  }

  async function main() {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'MAPS_CS_READY' });
    } catch {
      return; // background indisponível (ex.: extensão recarregada)
    }
    if (!response || !response.shouldRun) return;

    await randomDelay(400, 900);
    await runQuery(response.remainingTarget);
  }

  main();
})();
