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
  const LOG_PREFIX = '[WhatsProspect]';
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  const SELECTORS = {
    feed: 'div[role="feed"]',
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

  // Rótulos que aparecem como h1 mas não são nome de empresa nenhuma —
  // ex.: cards de anúncio/patrocinado têm seu próprio h1 com esse texto,
  // separado do h1 da empresa anunciada.
  const NON_BUSINESS_HEADING_PATTERN = /^(patrocinado|sponsored|an[uú]ncio|promovido)\b/i;

  // A página do Maps costuma ter mais de um elemento role="main" (um para
  // a lista de resultados, outro para o painel de detalhes da empresa
  // aberta). document.querySelector pega sempre o primeiro — que muitas
  // vezes é o da lista, com um h1 genérico tipo "Resultados" usado só pra
  // acessibilidade — então em vez de confiar nisso, procura o h1 que NÃO
  // está dentro da lista de resultados (que sabemos localizar com
  // segurança) e usa o role="main" mais próximo dele como raiz real.
  function findDetailHeading(feedEl) {
    const headings = Array.from(document.querySelectorAll('h1'));
    for (const h of headings) {
      if (feedEl && feedEl.contains(h)) continue;
      const text = h.textContent.trim();
      if (text && !NON_BUSINESS_HEADING_PATTERN.test(text)) return h;
    }
    return null;
  }

  function detailRootFromHeading(h1) {
    return (h1 && h1.closest('[role="main"]')) || document.body;
  }

  // Quando a busca retorna um resultado só muito específico, o Maps às
  // vezes pula direto pra página de detalhes da empresa, sem nunca
  // mostrar a lista (div[role="feed"]). Detecta esse caso pra não
  // desistir a busca inteira à toa.
  function detectSingleResultPage() {
    if (!/\/maps\/place\//.test(window.location.href)) return null;
    const h1 = findDetailHeading(null);
    const name = h1 ? h1.textContent.trim() : '';
    if (!name) return null;
    return { root: detailRootFromHeading(h1), name };
  }

  function parseCityState(address) {
    if (!address) return { cidade: '', estado: '' };
    const match = address.match(/([A-Za-zÀ-ÖØ-öø-ÿ'.\s]+?)\s*-\s*([A-Z]{2})(?:,|\s|$)/);
    if (match) {
      return { cidade: match[1].trim(), estado: match[2] };
    }
    return { cidade: '', estado: '' };
  }

  // O HTML do Google Maps muda com frequência, então a extração tenta
  // várias estratégias em ordem até uma funcionar, em vez de depender de
  // um único seletor.
  function extractByLabel(root, keywordPattern) {
    const candidates = root.querySelectorAll('[aria-label]');
    for (const el of candidates) {
      const label = el.getAttribute('aria-label') || '';
      if (keywordPattern.test(label)) {
        return label.replace(/^[^:]*:\s*/, '').trim();
      }
    }
    return '';
  }

  function extractPhone(root) {
    if (!root) return '';

    const byItemId = root.querySelector('button[data-item-id^="phone:tel:"]');
    if (byItemId) {
      const digits = (byItemId.getAttribute('data-item-id') || '').replace('phone:tel:', '');
      if (digits) return digits;
    }

    const telLink = root.querySelector('a[href^="tel:"]');
    if (telLink) {
      const digits = (telLink.getAttribute('href') || '').replace('tel:', '');
      if (digits) return digits;
    }

    const byLabel = extractByLabel(root, /^(telefone|phone)[:\s]/i);
    if (byLabel) return byLabel;

    // Último recurso: qualquer botão cujo texto pareça um telefone BR.
    const buttons = root.querySelectorAll('button, a');
    for (const el of buttons) {
      const text = (el.textContent || '').trim();
      if (/^\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}$/.test(text)) return text;
    }

    return '';
  }

  function extractWebsite(root) {
    if (!root) return '';
    const byItemId = root.querySelector('a[data-item-id="authority"]');
    if (byItemId) {
      const href = byItemId.getAttribute('href') || '';
      if (href) return href;
    }
    const byLabel = root.querySelector('a[aria-label^="Site:" i], a[aria-label^="Website:" i]');
    if (byLabel) return byLabel.getAttribute('href') || '';
    return '';
  }

  function extractAddress(root) {
    if (!root) return '';
    const byItemId = root.querySelector('button[data-item-id="address"]');
    if (byItemId) {
      const label = (byItemId.getAttribute('aria-label') || '').replace(/^[^:]*:\s*/, '').trim();
      if (label) return label;
    }
    return extractByLabel(root, /^(endere[cç]o|address)[:\s]/i);
  }

  async function waitForDetail(previousName, feedEl, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isBlockedPage()) return null;
      const h1 = findDetailHeading(feedEl);
      const name = h1 ? h1.textContent.trim() : '';
      if (name && name !== previousName) return { root: detailRootFromHeading(h1), name };
      await sleep(200);
    }
    return null;
  }

  function extractLeadFromDetail(root, nome) {
    const endereco = extractAddress(root);
    const { cidade, estado } = parseCityState(endereco);

    return {
      nome,
      telefoneCru: extractPhone(root),
      site: extractWebsite(root),
      endereco,
      cidade,
      estado,
      categoria: '',
      origemLink: window.location.href,
    };
  }

  async function openCardAndExtract(card, previousName, feedEl) {
    card.scrollIntoView({ block: 'center' });
    card.click();
    const detail = await waitForDetail(previousName, feedEl);
    if (!detail) {
      const blocked = isBlockedPage();
      log('Painel de detalhes não abriu a tempo (timeout).', { blocked, href: card.href });
      return { lead: null, blocked };
    }

    const lead = extractLeadFromDetail(detail.root, detail.name);
    log('Extraído:', {
      nome: lead.nome,
      telefoneCru: lead.telefoneCru || '(vazio)',
      site: lead.site || '(vazio)',
      endereco: lead.endereco || '(vazio)',
    });

    // Volta para a lista de resultados usando o histórico do próprio Maps.
    window.history.back();
    await randomDelay(500, 900);

    return { lead, blocked: false };
  }

  // feed.scrollTo() nem sempre funciona porque o elemento que realmente
  // tem o scroll (overflow-y) às vezes é um ancestral ou descendente do
  // div[role="feed"], não ele mesmo. Rolar até o último card ficar visível
  // (scrollIntoView) funciona independente de qual elemento seja o
  // verdadeiro container com scroll, porque o navegador resolve isso
  // sozinho subindo pela árvore do DOM.
  function scrollFeedToBottom(feed) {
    const cards = getCardLinks(feed);
    const lastCard = cards[cards.length - 1];
    if (lastCard) {
      lastCard.scrollIntoView({ block: 'end', behavior: 'auto' });
    } else {
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'auto' });
    }
  }

  async function runQuery(remainingTarget, combo) {
    const comboLabel = combo ? `${combo.variacao} em ${combo.cidade}` : '(desconhecida)';
    log('Iniciando busca. Meta de leads restante:', remainingTarget, '| Combinação esperada:', comboLabel, '| URL atual:', window.location.href);
    const feed = await waitForFeed();
    if (!feed) {
      if (isBlockedPage()) {
        log('Bloqueado (verificação anti-robô) antes de achar a lista de resultados.');
        chrome.runtime.sendMessage({ type: 'MAPS_BLOCKED' });
        return;
      }

      const single = detectSingleResultPage();
      if (single) {
        log(
          'Nenhuma lista encontrada, mas a busca caiu direto numa página de empresa única:',
          single.name,
          '| Combinação que estava sendo buscada:',
          comboLabel,
          '| URL no momento da extração:',
          window.location.href
        );
        const lead = extractLeadFromDetail(single.root, single.name);
        log('Extraído:', {
          nome: lead.nome,
          telefoneCru: lead.telefoneCru || '(vazio)',
          site: lead.site || '(vazio)',
          endereco: lead.endereco || '(vazio)',
        });
        chrome.runtime.sendMessage({ type: 'MAPS_LEAD_FOUND', lead });
        chrome.runtime.sendMessage({ type: 'MAPS_QUERY_DONE', found: 1 });
        return;
      }

      log('Não encontrei a lista de resultados (div[role="feed"]) — nenhum lead nesta busca.');
      chrome.runtime.sendMessage({ type: 'MAPS_QUERY_DONE', found: 0 });
      return;
    }
    log('Lista de resultados encontrada com', getCardLinks(feed).length, 'card(s) iniciais.');

    const processedHrefs = new Set();
    let collected = 0;
    let stableRounds = 0;
    let lastDetailName = '';

    while (collected < remainingTarget) {
      const cards = getCardLinks(feed).filter((c) => !processedHrefs.has(c.href));

      for (const card of cards) {
        processedHrefs.add(card.href);

        const { lead, blocked } = await openCardAndExtract(card, lastDetailName, feed);
        if (blocked) {
          log('Bloqueado (verificação anti-robô) durante a extração.');
          chrome.runtime.sendMessage({ type: 'MAPS_BLOCKED' });
          return;
        }
        if (lead) {
          lastDetailName = lead.nome;
          chrome.runtime.sendMessage({ type: 'MAPS_LEAD_FOUND', lead });
          collected += 1;
          log('Enviado ao background. Total coletado nesta busca:', collected);
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

    log('Busca finalizada. Total coletado:', collected);
    chrome.runtime.sendMessage({ type: 'MAPS_QUERY_DONE', found: collected });
  }

  async function main() {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'MAPS_CS_READY' });
    } catch (error) {
      log('Não consegui falar com o background (extensão recarregada?):', error.message);
      return;
    }
    if (!response || !response.shouldRun) {
      log('Nenhum job ativo para esta aba — script não vai agir.');
      return;
    }

    log('Job ativo confirmado pelo background. Iniciando em instantes...');
    await randomDelay(400, 900);
    await runQuery(response.remainingTarget, response.combo);
  }

  main();
})();
