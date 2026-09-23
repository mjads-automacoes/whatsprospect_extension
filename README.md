# WhatsProspect — Extensão Chrome para Prospecção de Leads

Extensão para Google Chrome (Manifest V3) que busca empresas por
segmento/palavra-chave em uma ou mais cidades, usando a **Google Places API
(New)** como fonte de dados comercial autorizada, e gera listas de
prospecção prontas para exportar em CSV.

## Funcionamento

1. Você informa o **segmento/palavra-chave** (ex.: "Oficina mecânica"), uma
   ou mais **cidades** separadas por vírgula e a **quantidade de leads**
   desejada.
2. A extensão gera automaticamente **variações relevantes** da
   palavra-chave (ex.: Centro automotivo, Auto Center, Mecânica automotiva,
   Manutenção automotiva) usando um dicionário de sinônimos para segmentos
   comuns no Brasil. Você pode remover variações sugeridas ou adicionar as
   suas próprias antes de buscar.
3. Cada variação é pesquisada em cada cidade via Google Places API.
4. Os resultados são deduplicados (por ID do Google, depois por telefone e,
   por fim, por nome+cidade), os telefones são padronizados para o formato
   `+55 (DDD) NÚMERO`, e é possível filtrar para manter somente empresas com
   telefone.
5. Empresas já prospectadas anteriormente ficam salvas em um histórico
   local (`chrome.storage.local`) e podem ser automaticamente ignoradas em
   buscas futuras.
6. Os leads encontrados podem ser exportados em **CSV** (compatível com
   Excel e Google Sheets), com as colunas: Nome, Telefone, Cidade, Estado,
   Categoria, Site, Endereço, Origem/Link e Palavra-chave utilizada.

## Por que a Google Places API (e não "raspar" o Google Maps)?

A extensão foi projetada para usar exclusivamente a Google Places API
(New), que é a forma **autorizada e oficial** de consultar dados de
estabelecimentos comerciais do Google. Fazer scraping automatizado das
páginas do Google Maps violaria os Termos de Serviço do Google — por isso
essa abordagem não foi implementada.

A Places API tem custo por consulta (com cota gratuita mensal). Consulte a
[página de preços](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
antes de usar em volume.

## Estrutura do projeto

```
whatsprospect_extension/
├── manifest.json
├── icons/
├── src/
│   ├── background/
│   │   └── service-worker.js   # reservado para automações futuras
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js            # fluxo principal de busca/exportação
│   ├── options/
│   │   ├── options.html
│   │   ├── options.css
│   │   └── options.js          # configuração da chave de API e histórico
│   └── lib/
│       ├── keywordVariations.js  # geração de variações de palavra-chave
│       ├── phoneUtils.js         # normalização/validação de telefone BR
│       ├── dedupe.js             # deduplicação de leads
│       ├── csv.js                # geração do arquivo CSV
│       ├── storage.js            # configurações + histórico (chrome.storage)
│       ├── placesApi.js          # cliente da Google Places API (New)
│       └── search.js             # orquestrador da busca
└── README.md
```

## Como instalar (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta
   `whatsprospect_extension`.
4. Clique no ícone da extensão e depois no ícone de engrenagem (⚙) para
   abrir as **Opções**.
5. Gere uma chave de API no
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   habilite a **Places API (New)** e cole a chave nas Opções.

## Como usar

1. Abra o popup da extensão.
2. Preencha segmento, cidades e quantidade desejada.
3. Clique em **Gerar variações da palavra-chave** e ajuste a lista se
   necessário.
4. Clique em **Buscar leads**. O progresso aparece na área de status.
5. Revise os resultados na tabela e clique em **Exportar CSV**.

## Roadmap / preparado para o futuro

- Integração **Google Sheets → N8N → CRM → WhatsApp**: já existe um
  placeholder em `service-worker.js` (mensagem `SEND_TO_WEBHOOK`) e um campo
  reservado (desabilitado) na página de Opções para a URL do webhook do
  N8N. A implementação completa (POST automático de novos leads) fica para
  uma próxima etapa.
- Busca em segundo plano (via `chrome.alarms` / port de longa duração) para
  permitir buscas grandes mesmo com o popup fechado.
- Editor de dicionário de sinônimos pela própria interface.

## Limitações conhecidas (v0.1)

- A busca roda enquanto o popup estiver aberto; fechar o popup interrompe
  uma busca em andamento.
- O dicionário de variações de palavra-chave cobre os segmentos mais comuns
  no Brasil; termos não mapeados retornam apenas a palavra-chave original
  (adicione variações manualmente na interface, se necessário).
- Requer uma chave de API paga da Google (com cota gratuita mensal).
