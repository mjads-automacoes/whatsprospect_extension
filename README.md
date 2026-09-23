# WhatsProspect — Extensão Chrome para Prospecção de Leads

Extensão para Google Chrome (Manifest V3) que busca empresas por
segmento/palavra-chave em uma ou mais cidades no **Google Maps**, remove
duplicados e gera listas de prospecção prontas para exportar em CSV.

## ⚠️ Aviso importante sobre a fonte de dados

Por padrão, esta extensão **automatiza a navegação no Google Maps** dentro
do seu próprio navegador para ler os dados exibidos na tela (nome,
telefone, endereço, site), em vez de usar uma API paga. Isso foi uma
escolha explícita para não depender de custo, mas tem consequências que
você deve entender antes de usar:

- **Provavelmente viola os Termos de Serviço do Google** (que proíbem
  extração automatizada de dados do Maps). O risco é seu.
- O Google pode responder com uma **verificação anti-robô (CAPTCHA)** ou
  bloqueio temporário de IP/conta se detectar automação, especialmente em
  buscas grandes ou muito frequentes.
- A extração depende da estrutura HTML atual do Google Maps
  (`src/content/maps-scraper.js`), que a Google pode alterar sem aviso e
  quebrar a extensão. Os seletores usados são os mais estáveis disponíveis
  (atributos `data-item-id`, `role`, etc.), mas nada garante estabilidade
  a longo prazo.
- Use em **volume moderado** (algumas dezenas/centenas de leads por vez,
  não milhares por dia) e evite deixar rodando continuamente.

Se em algum momento você quiser uma fonte 100% dentro dos termos do
Google, o código já inclui um cliente pronto para a **Google Places API
(New)** (`src/lib/placesApi.js` + `src/lib/search.js`), uma API oficial e
paga (com cota gratuita mensal). Ela não está conectada ao popup nesta
versão, mas pode ser reativada facilmente — veja a seção de Opções.

## Funcionamento

1. Você informa o **segmento/palavra-chave** (ex.: "Oficina mecânica"), uma
   ou mais **cidades** separadas por vírgula e a **quantidade de leads**
   desejada.
2. A extensão gera automaticamente **variações relevantes** da
   palavra-chave (ex.: Centro automotivo, Auto Center, Mecânica automotiva,
   Manutenção automotiva) usando um dicionário de sinônimos para segmentos
   comuns no Brasil. Você pode remover variações sugeridas ou adicionar as
   suas próprias antes de buscar.
3. Ao clicar em **Buscar leads**, a extensão abre uma aba do Google Maps e
   navega automaticamente por cada combinação de (variação × cidade),
   rolando a lista de resultados e abrindo cada estabelecimento para ler
   nome, telefone, site e endereço.
4. Os resultados são deduplicados (por telefone e, quando não há telefone,
   por nome+cidade), os telefones são padronizados para o formato
   `+55 (DDD) NÚMERO`, e é possível filtrar para manter somente empresas com
   telefone.
5. Empresas já prospectadas anteriormente ficam salvas em um histórico
   local (`chrome.storage.local`) e podem ser automaticamente ignoradas em
   buscas futuras.
6. Os leads encontrados podem ser exportados em **CSV** (compatível com
   Excel e Google Sheets), com as colunas: Nome, Telefone, Cidade, Estado,
   Categoria, Site, Endereço, Origem/Link e Palavra-chave utilizada.

## Como a automação do Maps funciona (arquitetura)

Diferente de uma chamada de API simples, controlar a navegação numa aba
real do navegador exige um fluxo orientado a eventos, porque o Chrome pode
encerrar o service worker (background) a qualquer momento em que ele
fique ocioso por ~30s:

1. O **popup** envia `START_MAPS_JOB` para o **background** com os
   parâmetros da busca.
2. O **background** monta a lista de combinações cidade×variação, salva o
   estado do job em `chrome.storage.local` (`src/lib/mapsJob.js`) e abre
   uma aba do Google Maps na primeira busca.
3. O **content script** (`src/content/maps-scraper.js`), injetado
   automaticamente em qualquer página `google.com/maps/*`, pergunta ao
   background "há um job ativo para esta aba?". Se sim, ele rola a lista de
   resultados, abre cada card, extrai os dados do painel de detalhes e
   envia cada lead encontrado de volta para o background
   (`MAPS_LEAD_FOUND`).
4. Ao terminar aquela busca, o content script avisa `MAPS_QUERY_DONE`; o
   background avança para a próxima combinação e navega a mesma aba para a
   próxima URL de busca — o que aciona o content script novamente.
5. Se o content script detectar uma página de verificação anti-robô, ele
   avisa `MAPS_BLOCKED`; o background pausa o job e o popup mostra um botão
   **"Retomar após verificação"** para você continuar depois de resolver o
   CAPTCHA manualmente na aba aberta.
6. O popup escuta mudanças no `chrome.storage.local` (`chrome.storage.onChanged`)
   para atualizar a lista de leads e o status em tempo real, mesmo que
   tenha sido fechado e reaberto no meio da busca.

Todo o estado do job (combinações, índice atual, leads já coletados) fica
em `chrome.storage.local` — nada depende de variáveis em memória do
service worker, que poderiam ser perdidas entre uma mensagem e outra.

## Estrutura do projeto

```
whatsprospect_extension/
├── manifest.json
├── icons/
├── src/
│   ├── background/
│   │   └── service-worker.js     # orquestra o job de scraping do Maps
│   ├── content/
│   │   └── maps-scraper.js       # roda dentro da aba do Google Maps
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js               # formulário, progresso em tempo real, export CSV
│   ├── options/
│   │   ├── options.html
│   │   ├── options.css
│   │   └── options.js             # histórico + chave de API (uso futuro)
│   └── lib/
│       ├── keywordVariations.js  # geração de variações de palavra-chave
│       ├── phoneUtils.js         # normalização/validação de telefone BR
│       ├── dedupe.js             # deduplicação de leads
│       ├── csv.js                # geração do arquivo CSV
│       ├── storage.js            # configurações + histórico (chrome.storage)
│       ├── mapsJob.js            # estado do job de scraping do Maps
│       ├── supabaseAuth.js       # login Google via Supabase Auth (chrome.identity)
│       ├── supabaseLeads.js      # sincronização de leads com o Supabase
│       ├── supabaseManagementApi.js  # provisionamento automático via Management API
│       ├── supabaseSchema.js     # SQL do schema embutido (usado pelo provisionamento)
│       ├── placesApi.js          # cliente da Google Places API (New) — não usado por padrão
│       └── search.js             # orquestrador via Places API — não usado por padrão
├── supabase/
│   └── schema.sql                # tabela de leads + Row Level Security
└── README.md
```

## Como instalar (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta
   `whatsprospect_extension`.
4. Pronto — não é necessária nenhuma chave de API para o modo padrão
   (scraping do Maps).

## Como usar

1. Abra o popup da extensão.
2. Preencha segmento, cidades e quantidade desejada.
3. Clique em **Gerar variações da palavra-chave** e ajuste a lista se
   necessário.
4. Clique em **Buscar leads**. Uma aba do Google Maps será aberta e
   navegará automaticamente; acompanhe o progresso no popup.
5. Se aparecer o aviso de verificação anti-robô, resolva manualmente na
   aba do Maps e clique em **Retomar após verificação**.
6. Revise os resultados na tabela (atualizados em tempo real) e clique em
   **Exportar CSV** quando quiser.

## Sincronização com Supabase (opcional, login com Google)

Por padrão os leads ficam só no `chrome.storage.local` do navegador onde a
extensão roda. Se você quiser um histórico centralizado na nuvem (acessível
de qualquer computador, base para futuras integrações com N8N/CRM), pode
conectar um projeto [Supabase](https://supabase.com) gratuito, por dois
caminhos:

### Opção A — Provisionamento automático (Opções → Sincronização com Supabase)

1. Gere um **Personal Access Token** em
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
   (de preferência com escopo limitado a um projeto/organização, não o token
   "classic" de acesso total).
2. Cole esse token nas **Opções** da extensão, escolha a organização e
   clique em **Provisionar automaticamente**. Isso cria o projeto, roda o
   `supabase/schema.sql`, busca as chaves da API e registra a URL de
   redirecionamento — tudo via
   [Management API](https://supabase.com/docs/reference/api/introduction) do
   Supabase, sem você abrir o painel manualmente.
3. O único passo que **não tem como ser automatizado** (trava de segurança
   do próprio Google, nenhuma ferramenta de terceiros pode contornar): criar
   um **Client ID/Secret OAuth** no
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (tipo "Aplicativo Web"). Se você colar esse Client ID/Secret nos campos
   opcionais da tela de provisionamento, a extensão configura o provedor
   Google no Supabase para você; só a criação em si no Google Cloud é
   manual.
4. No popup, clique em **Entrar com Google**.

> ⚠️ Esse fluxo automático chama endpoints da Management API do Supabase
> (`api.supabase.com`) cujos nomes de campo exatos (principalmente na
> configuração de Auth/redirect URLs) foram reconstruídos a partir de
> documentação pública e podem ter mudado. Cada etapa mostra o erro cru da
> API se algo falhar, e as etapas já concluídas (projeto, schema, chaves)
> não são perdidas — só a etapa que falhar precisa ser refeita manualmente
> pela Opção B.

### Opção B — Configuração manual

1. Crie um projeto em [app.supabase.com](https://app.supabase.com).
2. No **SQL Editor** do projeto, rode o conteúdo de `supabase/schema.sql`
   deste repositório — cria a tabela `leads` com Row Level Security (cada
   usuário só vê os próprios dados).
3. Em **Authentication → Providers → Google**, habilite o provedor e
   informe um Client ID/Secret OAuth do
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (tipo "Aplicativo Web"), usando o redirect URI de callback que o próprio
   Supabase exibe naquela tela.
4. Em **Authentication → URL Configuration → Redirect URLs**, adicione a
   URL da extensão — a Options page mostra o valor exato
   (`chrome.identity.getRedirectURL()`). Como o `manifest.json` já tem um
   campo `"key"` fixo, essa URL é sempre:
   `https://lejbdcmemfjnhnkjbilkdcobanlaobmf.chromiumapp.org/`
   (só muda se você recarregar a extensão a partir de outra chave).
5. Abra as **Opções** da extensão, cole a URL do projeto Supabase e a
   **chave anônima (anon/public key)** — ambas em Project Settings → API no
   painel do Supabase — e salve.
6. No popup, clique em **Entrar com Google**. A partir daí, cada busca
   concluída sincroniza os leads (por `upsert`, sem duplicar) com a tabela
   `leads` do seu projeto.

> A chave privada RSA usada para gerar esse `"key"` fixo no manifest não
> fica no repositório (nunca comite chaves privadas). Ela só é necessária
> se algum dia você quiser empacotar a extensão como `.crx` mantendo o
> mesmo ID — guarde-a separadamente se for esse o caso.

Isso é **totalmente opcional**: sem configurar nada aqui, a extensão
continua funcionando exatamente como antes, só com o histórico local.

## Roadmap / preparado para o futuro

- Integração **Google Sheets → N8N → CRM → WhatsApp**: já existe um
  placeholder em `service-worker.js` (mensagem `SEND_TO_WEBHOOK`) e um campo
  reservado (desabilitado) na página de Opções para a URL do webhook do
  N8N. A implementação completa (POST automático de novos leads) fica para
  uma próxima etapa.
- Reconexão da **Google Places API (New)** como fonte alternativa opcional
  (seletor de fonte de dados no popup), para quem preferir pagar em troca
  de conformidade com os Termos de Serviço e maior estabilidade.
- Fonte alternativa 100% gratuita e dentro dos termos, usando dados abertos
  de CNPJ (Receita Federal), como fallback/complemento ao scraping.
- Editor de dicionário de sinônimos pela própria interface.

## Limitações conhecidas (v0.2)

- Depende da estrutura HTML atual do Google Maps; mudanças no site podem
  quebrar a extração (os seletores ficam centralizados em
  `maps-scraper.js` para facilitar ajustes).
- Categoria do estabelecimento nem sempre é extraída (campo "se
  disponível").
- Uso em volume alto aumenta o risco de bloqueio temporário pelo Google.
- O dicionário de variações de palavra-chave cobre os segmentos mais comuns
  no Brasil; termos não mapeados retornam apenas a palavra-chave original
  (adicione variações manualmente na interface, se necessário).
