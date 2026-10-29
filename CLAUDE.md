# MIRA Creator Finder

Sistema interno da MIRA Safety para encontrar, medir, filtrar e organizar criadores de conteúdo para o programa de afiliados. O usuário digita o tema de uma Round (ex.: "Pentagon FORTRESS") e o sistema devolve uma lista de creators com métricas, checagem de duplicidade, status e motivo, pronta para revisão humana.

O processo completo que o sistema automatiza está em `docs/SOP.md`. Leia esse arquivo inteiro antes de escrever qualquer código. Quando este arquivo e o SOP divergirem, siga o SOP e me avise.

## Quem sou eu e como trabalhar comigo

- Sou o Ian, estagiário na MIRA. Meu stack principal é HTML, CSS e JavaScript puro. Uso Windows e VS Code.
- Explique cada fase em português, de forma simples, antes de começar.
- Trabalhe por fases. Ao fim de cada fase, pare, me mostre como testar e espere meu ok antes da próxima.
- Nunca use travessão (em dash) em nenhum texto: nem no código, nem em comentários, nem em mensagens geradas. Use vírgula, ponto ou dois pontos.

## Stack

- Backend: Node.js (versão LTS) com Express.
- Frontend: HTML, CSS e JavaScript puro, servido pelo próprio Express. Sem React, sem build.
- APIs externas:
  - YouTube Data API v3 (`googleapis`, chave `YOUTUBE_API_KEY`) para busca de canais e coleta de vídeos. Grátis, cota de 10.000 unidades por dia (`search.list` custa 100; `channels.list`, `playlistItems.list` e `videos.list` custam 1 cada, em lotes de até 50).
  - Apify (cliente oficial `apify-client`) reservado para TikTok e Instagram na Fase 7. Não usar para YouTube.
  - Anthropic (SDK oficial `@anthropic-ai/sdk`) para gerar buscas, classificar creators e escrever mensagens. Use `claude-haiku-5-5` para classificação em volume e `claude-sonnet-5-5` para gerar buscas e mensagens. Confirme os nomes de modelo na documentação antes de usar.
  - Monday (API GraphQL, `https://api.monday.com/v2`) somente leitura.
  - Google Sheets (`googleapis`, service account), leitura da planilha principal e criação de planilhas novas.
- Hospedagem final: Render (web service), com URL gratuita `*.onrender.com`. Não precisamos de domínio próprio.

## Segredos

Todas as chaves ficam em `.env` (local) e nas variáveis de ambiente do Render (produção). Nunca no código, nunca em logs, nunca no frontend.

Crie um `.env.example` com:

```
YOUTUBE_API_KEY=
APIFY_TOKEN=
ANTHROPIC_API_KEY=
MONDAY_TOKEN=
MONDAY_BOARD_ID=18359348579
GOOGLE_SERVICE_ACCOUNT_JSON=
MAIN_SHEET_ID=
OUTPUT_FOLDER_ID=
APP_PASSWORD=
```

Crie o `.gitignore` com `.env`, `node_modules/`, `output/` e qualquer arquivo de credencial do Google antes do primeiro commit.

Se uma chave estiver faltando, o sistema deve avisar claramente qual falta e seguir funcionando nas partes que não dependem dela (ex.: sem `MONDAY_TOKEN`, pula a checagem no Monday e marca `Duplicate Check: Monday not checked`).

## Estrutura de pastas

```
mira-creator-finder/
  CLAUDE.md
  docs/SOP.md
  .env.example
  server.js              rotas Express e autenticação simples
  src/
    pipeline.js          orquestra as etapas de uma Round
    brief.js             transforma tema/brief em queries (Claude)
    cli.js               comando de terminal da Fase 1
    config.js            leitura do .env, aviso de chaves faltando, redact de segredos
    claude.js            cliente do Claude (JSON via structured outputs, contagem de custo)
    youtube.js           busca de canais e coleta de vídeos (YouTube Data API)
    output.js            CSV (colunas da Saída) e JSON (SOP 17)
    metrics.js           médias, outliers, ratio, atividade
    dedupe.js            normalização e comparação
    sources/
      monday.js          leitura do board
      sheets.js          leitura da planilha principal e escrita de saída
    classify.js          pré-filtro e critérios (Claude + regras fixas)
    messages.js          mensagens do Bryce (fase 6)
    jobs.js              fila simples de jobs em memória
  public/
    index.html           formulário do tema e acompanhamento
    styles.css
    app.js
  output/                CSVs gerados localmente
  test/                  testes (npm test), sem chamadas a APIs
```

Rótulos de métricas na saída ficam em inglês, como no SOP 17: ratio `Good`/`Acceptable`/`Weak`, atividade `Active`/`Attention`/`Inactive`.

## Fases

### Fase 0: setup
Projeto Node, dependências, `.env.example`, `.gitignore`, estrutura de pastas, script `npm start`. Um `README.md` curto em português explicando como rodar.

### Fase 1: busca e métricas (linha de comando)
Comando: `node src/cli.js "Pentagon FORTRESS" --round 25 --target 20 --red-alert`

1. `brief.js`: o Claude gera de 8 a 15 queries a partir do tema, incluindo variações do tema (SOP seção 1 e 3.2). Retornar JSON puro.
2. `youtube.js`: buscar vídeos com `search.list` (`type=video`; em Red Alert com `publishedAfter`/`publishedBefore` da janela) e agrupar por canal. O vídeo encontrado vira candidato a conteúdo-gatilho. Depois `channels.list` para inscritos, descrição e playlist de uploads. Descartar canais abaixo de 10K inscritos (em todas as Rounds) antes de coletar vídeos, para poupar cota. Meta de candidatos brutos: cerca de 2x o alvo.
3. Para cada canal, coletar os vídeos longos e Shorts com views e data via `playlistItems.list` + `videos.list`. Para separar longos de Shorts, usar as playlists `UULF...` (longos) e `UUSH...` (Shorts), derivadas do channel ID; isso não é documentado oficialmente, então testar e cair para a duração se falhar.
4. `metrics.js` (SOP seção 6):
   - Média de vídeos longos: os 10 mais recentes depois de pular vídeos com menos de 7 dias e premieres/lives agendadas (decisão do Ian: pular primeiro, depois pegar 10). Se um único vídeo tiver mais de 5x a mediana, excluir e anotar o viral em Notes.
   - Média de Shorts: mesma lógica com os últimos 10. Sem Shorts: `No Shorts`.
   - Ratio views/inscritos: Boa (10% ou mais), Aceitável (3% a 10%), Fraca (menos de 3%).
   - Atividade pelo último upload: Ativo (até 30 dias), Atenção (30 a 90), Inativo (mais de 90).
   - Formatar números como `12K`, `1.2M`. Aceitar views tanto numéricas quanto em texto ("12 thousand views", "12K views").
5. Salvar CSV em `output/round-XX-tema-AAAA-MM-DD.csv` com as colunas da seção "Saída".

Testar com um limite baixo (10 canais) primeiro. Mostrar no terminal as unidades de cota do YouTube gastas e o número de chamadas ao Claude.

### Fase 2: filtros e status
1. Pré-filtro (SOP seção 4) e reprovação automática (SOP 8.1). Regras numéricas em código; julgamentos (é mídia ou loja? risco de marca? tem ligação com o tema? o conteúdo-gatilho é sobre o tema?) com o Claude, lendo títulos e descrições reais coletados. O Claude deve responder em JSON com `status`, `why` e `confidence`.
2. Critérios específicos por tipo de Round (SOP 8.3). Em Red Alert, o conteúdo-gatilho precisa ter data dentro da janela.
3. Status: `Approved`, `Maybe` ou `Not approved`, sempre com motivo de uma linha.
4. Ordenar: Approved, depois Maybe, depois Not approved.

### Fase 3: duplicidade (somente leitura)
1. Antes da busca, montar a lista de exclusão (SOP seção 2) lendo:
   - Monday board `MONDAY_BOARD_ID`, todos os grupos, com paginação via `items_page` e `cursor`.
   - Planilha principal inteira (todas as Rounds e todos os estagiários).
2. Descartar canais da lista de exclusão logo depois da busca, antes de coletar vídeos (poupa cota do YouTube).
3. Depois da coleta, checar cada candidato de novo (SOP seção 7) com normalização: minúsculas; remover `@`, espaços, pontuação, "the", "official", "tv", "channel"; trocar `&` por `and`; comparar também por URL e channel ID. Considerar match por "começa com" para nomes com sufixos como "(see notes)".
4. Preencher `Duplicate Check` com os textos exatos do SOP 7.5.
5. Me pergunte quais colunas do Monday guardam link e handle antes de implementar. Liste as colunas do board pela API para eu escolher.

### Fase 4: interface web e deploy
1. `public/index.html`: campos Tema, Número da Round, Quantidade alvo, Red Alert (sim/não), Janela de datas, Plataformas. Botão "Buscar creators".
2. O processamento leva minutos, então a rota cria um job e responde na hora com o ID. A página consulta o status a cada poucos segundos e mostra o progresso por etapa ("Gerando buscas", "Buscando no YouTube", "Calculando métricas", "Checando duplicados", "Classificando").
3. Resultado: tabela na página, botão para baixar CSV e, depois da fase 5, link da planilha.
4. Proteção: senha única (`APP_PASSWORD`) com sessão por cookie. Sem senha, nada é acessível. Limitar a uma Round rodando por vez e a um teto de canais por execução, para controlar custo.
5. Deploy no Render: me guie passo a passo (repositório no GitHub privado, web service, variáveis de ambiente, URL final).

### Fase 5: saída no Google Sheets
1. Cada execução cria uma planilha nova na pasta `OUTPUT_FOLDER_ID`, com nome `Round XX - Tema` e as colunas da seção "Saída".
2. Cores no nome conforme o SOP: verde aprovado, laranja maybe, vermelho reprovado.
3. Escrever na planilha principal (bloco do Ian) fica fora do escopo por enquanto. Não implementar sem eu pedir.

### Fase 6: mensagens
Gerar e-mail ou DM para os Approved seguindo o SOP seção 12 (assinatura do Bryce, conteúdo real citado, duas ideias por formato, frases rotativas, Calendly, sem travessão, nome real só se verificado). As mensagens ficam na coluna Specific Message. O sistema nunca envia nada.

### Fase 7: outras plataformas
TikTok, Instagram e buscas web (`site:substack.com`, `site:rumble.com`) para Rounds Red Alert. Escolher Actors e me mostrar custo antes.

## Saída (colunas, SOP 9.1)

Name of Account, Status, Why, Supervisor Feedback, Niche, Duplicate Check, Trigger Content (title + link + date), Instagram, Instagram Followers, TikTok, TikTok Followers, YouTube, YouTube Subscribers, Avg Video Views, Avg Shorts Views, Views/Subs Ratio, Activity, Last Upload, Email, YouTube Business Email, Website, Other Links, Best Contact Method, Specific Message, Additional Notes.

Decisão do Ian: usar estas colunas em vez da coluna "YouTube Views (last 28 days)" do SOP 9.1, porque esse dado depende do Social Blade.

Internamente, cada creator segue o formato JSON do SOP seção 17.

## Regras que o sistema nunca pode quebrar

1. Nunca inventar números, nomes, e-mails, títulos ou datas. Sem confirmação: `Not verified` ou vazio.
2. Nunca deduzir nome real a partir do e-mail.
3. Nunca contatar creators. Nenhum envio de e-mail ou DM.
4. Nunca fazer login em contas de terceiros nem resolver captcha. Não usar Actors que façam isso (ex.: extração do e-mail comercial escondido do YouTube).
5. Monday e planilha principal são somente leitura.
6. Localizar linhas sempre pelo nome, nunca por número de linha salvo antes.
7. Nunca expor chaves no frontend, em logs ou em mensagens de erro.
8. Sem travessão em nenhum texto.

## Custos

Sempre que for usar um Actor novo, me diga o preço por item e estime o custo de uma Round de 50 candidatos antes de rodar. Registrar no fim de cada execução as unidades de cota do YouTube gastas, o custo do Apify (quando usado) e o número de chamadas ao Claude.
