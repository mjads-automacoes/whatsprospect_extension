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
│       ├── oauthConfig.js        # Client ID + URL da Edge Function (preenchido pelo mantenedor)
│       ├── supabaseConnect.js    # fluxo OAuth+PKCE "Conectar com Supabase"
│       ├── supabaseLeads.js      # sincronização de leads com o Supabase
│       ├── supabaseManagementApi.js  # criação automática do projeto via Management API
│       ├── supabaseSchema.js     # SQL do schema embutido (usado pelo provisionamento)
│       ├── placesApi.js          # cliente da Google Places API (New) — não usado por padrão
│       └── search.js             # orquestrador via Places API — não usado por padrão
├── supabase/
│   ├── schema.sql                       # tabela de leads + Row Level Security
│   └── functions/oauth-exchange/        # Edge Function: troca o code OAuth por token
│       └── index.ts                     # (guarda o Client Secret; nunca vai na extensão)
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

## Sincronização com Supabase (opcional)

Por padrão os leads ficam só no `chrome.storage.local` do navegador onde a
extensão roda. Se você quiser um histórico centralizado na nuvem, cada
empresa que usar a extensão pode conectar o **próprio banco Supabase
gratuito**, isolado dos leads de qualquer outra empresa.

### Experiência de quem instala a extensão

Não precisa entender Supabase, copiar token nem rodar SQL. É só:

1. Abrir **Opções** da extensão.
2. Clicar em **"Conectar com Supabase"**.
3. Fazer login (ou criar conta, se ainda não tiver) na tela que abre —
   é a tela oficial do Supabase, não algo da extensão.
4. Pronto. A extensão cria o banco de dados da empresa automaticamente
   (projeto + tabela) e passa a sincronizar os leads encontrados a partir
   daí.

Como cada empresa tem seu próprio projeto Supabase, a separação de dados
entre empresas diferentes acontece **no nível do projeto** — por isso não
existe (nem é preciso) tela de login dentro da extensão em si.

### Setup do mantenedor (você, uma única vez)

Para o botão "Conectar com Supabase" funcionar para todo mundo que instalar
a extensão, alguém precisa registrar uma única aplicação OAuth e publicar
uma função intermediária que guarda o segredo dela. Isso é feito **uma
vez**, não a cada instalação:

1. **Registre um OAuth App do Supabase** (o que autoriza a extensão a criar
   projetos em nome de quem clicar em "Conectar"):
   - No painel do Supabase, vá em **Organization → Settings → OAuth Apps →
     Add application**.
   - Redirect URL: `https://lejbdcmemfjnhnkjbilkdcobanlaobmf.chromiumapp.org/`
     (fixa, porque o `manifest.json` já tem uma chave `"key"` pinada — veja
     a nota mais abaixo).
   - Copie o **Client ID** gerado — ele é público, vai direto no código da
     extensão. Guarde o **Client Secret** para o próximo passo (ele NUNCA
     entra no código da extensão).

2. **Publique a Edge Function** que guarda esse Client Secret e faz a troca
   OAuth por você (`supabase/functions/oauth-exchange/`). Pode usar
   qualquer projeto Supabase seu, inclusive um pequeno só para isso:
   ```bash
   npx supabase login
   npx supabase functions deploy oauth-exchange --project-ref SEU_PROJECT_REF --no-verify-jwt
   npx supabase secrets set OAUTH_CLIENT_ID=xxxx OAUTH_CLIENT_SECRET=yyyy --project-ref SEU_PROJECT_REF
   ```
   A URL pública da function fica algo como
   `https://SEU_PROJECT_REF.supabase.co/functions/v1/oauth-exchange`.

3. **Preencha `src/lib/oauthConfig.js`** com o Client ID (passo 1) e a URL
   da function (passo 2), e publique essa versão da extensão. A partir daí,
   qualquer instalação já nasce com o botão "Conectar com Supabase"
   funcionando, sem nenhum passo extra.

> Por que precisa dessa function e não dá pra fazer 100% dentro da
> extensão? A troca do código OAuth por um token de acesso exige enviar o
> Client Secret — e um Client Secret nunca pode estar dentro do código de
> uma extensão distribuída (qualquer pessoa consegue abrir e extrair). A
> Edge Function é a única peça que conhece esse segredo; ela não guarda
> nenhum dado de cliente, só repassa essa troca.

> A chave privada RSA usada para o `"key"` fixo no `manifest.json` (que
> mantém a URL de redirecionamento estável) não fica no repositório — nunca
> comite chaves privadas.

### Já tenho um projeto Supabase

Nas Opções, dentro de "Já tenho um projeto Supabase (configurar
manualmente)", dá pra colar a URL e a chave anônima de um projeto criado
por fora (depois de rodar `supabase/schema.sql` nele), sem passar pelo
fluxo OAuth.

Tudo isso é **totalmente opcional**: sem conectar nada, a extensão
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
