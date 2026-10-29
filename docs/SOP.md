# MIRA Safety: Processo de Prospecção de Influenciadores (SOP para automação)

Versão 1.0 | Autor: Ian (com Claude) | Uso: instruções para o sistema automatizado de prospecção de afiliados

Este documento descreve, passo a passo, tudo o que é feito para encontrar, validar, registrar e abordar um criador de conteúdo. Ele foi escrito para que um sistema automatizado (agente de IA, script ou workflow) consiga executar o processo sem errar. Onde há uma regra que veio da supervisora (Marie), isso está marcado como **[Regra Marie]**. Onde é um padrão que adotamos e que pode ser ajustado, está marcado como **[Padrão ajustável]**.

---

## 0. Visão geral do pipeline

```
1. Receber o brief da Round
2. Montar a lista de exclusão (quem já foi usado)
3. Descobrir candidatos (busca)
4. Pré-filtro rápido (descartar óbvios)
5. Coletar dados de cada candidato
6. Calcular métricas (média de views, atividade, proporção views/inscritos)
7. Checar duplicidade (Monday + planilha principal + rounds anteriores)
8. Aplicar critérios de aprovação e dar status
9. Registrar na planilha de trabalho (aba da Round)
10. Enviar os aprovados para a planilha principal (bloco do Ian)
11. Aguardar revisão da Marie (cores)
12. Remover recusados, escrever mensagens dos aprovados
13. (Quando pedido) Cadastrar aprovados no Monday
14. Reportar no EOD
```

O sistema nunca deve pular a etapa 7 (duplicidade). É o erro mais caro do processo.

---

## 1. Entrada: o brief da Round

Toda Round começa com uma mensagem da Marie (normalmente no Slack). O sistema precisa extrair estes campos antes de começar:

| Campo | Exemplo (Round 21) | Exemplo (Round 25) |
|---|---|---|
| Número da Round | 21 | 25 |
| Tema | Family Preparedness Creators (Holiday Gift Season) | Operation Fortress (Red Alert) |
| Nicho alvo | famílias preparadas, homesteading, food storage, kits 72h | preppers, militares/veteranos, survival, notícias de preparedness |
| Conteúdo-gatilho exigido | gift guide, Christmas gifts for preppers, stocking stuffers, unboxing de fim de ano | vídeo/post sobre o plano FORTRESS do Pentágono ou variações |
| Janela de tempo do conteúdo | qualquer ano, mas o canal precisa estar ativo em 2026 | conteúdo postado nos últimos ~30 dias (Sept 30 a Oct 28, 2026) |
| Quantidade alvo | 20 | o máximo possível |
| Urgência | normal | URGENTE (Red Alert) |
| Plataformas | YouTube preferido, IG/TikTok aceitos | YouTube, TikTok, IG, Substack, podcasts, blogs |

**Rounds "Red Alert"**: são rounds ligadas a uma notícia quente. O valor está em abordar o criador enquanto o assunto ainda está em alta. Regras extras:
- Priorizar velocidade sobre volume.
- O conteúdo-gatilho precisa ser recente (data de postagem dentro da janela).
- Buscar também **variações do tema**, não só o nome oficial. Exemplo FORTRESS: "Pentagon 90 days", "bases off-grid", "90-day grid down", "Pentagon preparing for war on US soil", "Hegseth 90 days", "military bases microreactors", avisos de governos europeus para estocar comida ligados à mesma onda de notícias. **[Regra Marie: "pode ter variações, não só FORTRESS"]**

---

## 2. Lista de exclusão (montar ANTES de buscar)

Antes de procurar qualquer pessoa, o sistema monta uma lista de nomes/handles que não podem entrar:

1. **Todos os nomes da planilha principal** "Potential New Affiliates on Instagram, YouTube and TikTok" (todas as Rounds, todos os estagiários, não só o bloco do Ian).
2. **Todos os itens do Monday board** "Affiliate Partnership Tracking" (todos os grupos, incluindo New Leads, afiliados ativos, recusados).
3. **Rounds anteriores da planilha de trabalho**, incluindo os que foram reprovados (para não reavaliar o mesmo nome).
4. **Afiliados atuais da MIRA** (quem já tem código/link MIRA).
5. **Nomes que outros estagiários estão trabalhando** na mesma Round (ex.: bloco da Laura, bloco do Kevin).

Essa lista é passada para a etapa de busca como "EXCLUDE", para não gastar tempo pesquisando quem já foi usado. A checagem formal de duplicidade (etapa 7) ainda acontece depois, para cada candidato.

---

## 3. Descoberta de candidatos

### 3.1 Fontes
- **YouTube** (principal): busca por palavras-chave, aba de vídeos do canal, canais relacionados.
- **TikTok e Instagram**: busca por hashtag e palavra-chave; perfis de "prepper moms", famílias, veteranos.
- **Substack, blogs, podcasts, Rumble**: principalmente em Rounds de notícia (Red Alert).
- **Google/Web search** com `site:youtube.com`, `site:tiktok.com`, `site:rumble.com`, `site:substack.com`.

### 3.2 Como gerar as buscas
Para cada Round, gerar de 8 a 15 buscas combinando: tema + nicho + plataforma + ano.

Exemplos usados na Round 21:
- `prepper gift guide 2025 youtube`
- `christmas gifts for preppers 2025`
- `stocking stuffers for preppers`
- `emergency preparedness gift ideas family`
- `homestead gift guide 2025 preparedness`
- `72 hour kit christmas gift`

Exemplos usados na Round 25:
- `"Pentagon FORTRESS" youtube`
- `"90 days off grid" Pentagon prepper`
- `"Hegseth 90 days" video`
- `"military bases 90 days" prepare`
- `site:tiktok.com fortress pentagon`
- `site:substack.com FORTRESS Hegseth 90 days`
- `"UK government stockpile food" prepper reaction`

### 3.3 Divisão por ângulo (para ganhar velocidade)
Dividir a busca em frentes paralelas:
- Frente A: canais de YouTube.
- Frente B: criadores de Instagram/TikTok (especialmente mulheres, mães, famílias).
- Frente C: criadores com blog/site + presença social.
- Frente D (Red Alert): Substack, podcasts, Rumble, X.

Meta de candidatos brutos: cerca de 2x a quantidade final (ex.: para 20 aprovados, levantar 40 a 50 nomes).

---

## 4. Pré-filtro rápido (descarte imediato)

Descartar sem coletar dados completos se o candidato for:

| Motivo | Exemplo real |
|---|---|
| Já está na lista de exclusão | Canadian Prepper, City Prepping |
| Veículo de mídia / jornal / agregador de notícias | Forbes, The War Zone, Mario Nawfal |
| Loja / varejista (não é criador) | Prepper Shop, Chase Tactical (anotar como possível lead de atacado) |
| Canal grande de política/talk show, sem encaixe com equipamento e caro | Tim Pool, Glenn Beck, Valuetainment |
| Risco de marca (conteúdo extremista, conspiração pesada, desinformação) | Stew Peters, SGT Report |
| Vende produto concorrente de preparedness | Natural News / Mike Adams |
| Diz publicamente que não aceita patrocínio | Pinball Preparedness ("não me contate para patrocínios") |
| Sem ângulo com o tema da Round | Kadenventures (camping, sem ângulo família) |

---

## 5. Coleta de dados por criador

### 5.1 Campos obrigatórios

| Campo | Onde buscar | Observação |
|---|---|---|
| Nome do canal/conta | página do perfil | usar exatamente como aparece |
| Nome real (primeiro nome) | About do canal, site, créditos, LinkedIn, entrevistas | **só preencher se verificado**. Nunca deduzir pelo e-mail |
| Link de cada plataforma | perfil | YouTube, IG, TikTok, site, Substack |
| Seguidores/inscritos por plataforma | YouTube (página do canal), Social Blade, vidIQ | se não conseguir confirmar, escrever `Not verified` |
| Média de views de vídeos longos (YouTube) | aba `/videos` do canal | ver cálculo na seção 6 |
| Média de views de Shorts | aba `/shorts` do canal | ver seção 6 |
| Média de views IG/TikTok | últimos reels/vídeos do perfil ou Social Blade | ver seção 6 |
| Data do último upload | aba de vídeos | mede atividade |
| Conteúdo-gatilho | busca + página do vídeo | título exato + link + data |
| E-mail de contato | About do YouTube, descrição dos vídeos, site, Linktree, página de contato | preferir e-mail comercial |
| Melhor método de contato | regra na seção 5.3 | Email ou DM |
| Já menciona MIRA ou tem link de afiliado? | descrições dos vídeos, Linktree | se tiver código MIRA, é afiliado: reprovar como duplicado |
| Já trabalha com marcas parecidas? | descrições, storefront Amazon | ponto positivo (aceita parcerias), anotar em Notes |
| Ângulo / nicho (1 linha) | conteúdo | ex.: "Mãe de 4 com gift guide de fim de ano" |

### 5.2 Fontes de dados por plataforma
- **YouTube inscritos**: página do canal (texto "X subscribers").
- **YouTube views por vídeo**: página `youtube.com/@HANDLE/videos` e `youtube.com/@HANDLE/shorts`. Cada vídeo mostra views no rótulo (ex.: "12 thousand views"). Converter "thousand" = x1.000, "million" = x1.000.000, "K" e "M" também.
- **YouTube views 28 dias / crescimento**: Social Blade (`socialblade.com/youtube/handle/HANDLE`) ou vidIQ (`vidiq.com/youtube-stats/channel/CHANNEL_ID/`).
- **Instagram/TikTok**: Social Blade (`socialblade.com/instagram/user/HANDLE`, `socialblade.com/tiktok/user/HANDLE`) para seguidores, média de likes, engajamento. O Instagram bloqueia acesso sem login, então usar fontes públicas.
- **E-mail**: About do YouTube (às vezes escondido atrás de captcha, nesse caso usar descrição dos vídeos ou site), Linktree, site oficial, página "Contact" / "Work with me".

### 5.3 Melhor método de contato
1. Tem e-mail comercial ou pessoal público: **Email**.
2. Não tem e-mail, mas tem Instagram ou TikTok ativo: **DM** (Instagram/TikTok).
3. Só tem e-mail comercial escondido no YouTube: **YouTube business email**.
4. Só tem site com formulário: **Website contact form**.

**[Regra Marie]** O criador precisa ter e-mail comercial OU Instagram para ser contatável.

---

## 6. Cálculo das métricas

### 6.1 Média de views (vídeos longos, YouTube) **[Padrão ajustável]**
- Pegar os **últimos 10 vídeos longos** publicados.
- **Excluir** vídeos com menos de 7 dias (ainda estão crescendo) e lives agendadas/premieres que ainda não aconteceram.
- **Excluir** outliers extremos só se for 1 vídeo viral isolado (mais de 5x a mediana). Anotar o viral em Notes.
- Média = soma das views / quantidade de vídeos considerados. Arredondar e escrever no formato `12K`, `1.2M`.

### 6.2 Média de Shorts
- Mesma lógica, com os **últimos 10 Shorts**.
- Se o canal não posta Shorts, deixar vazio ou escrever `No Shorts`.

### 6.3 Média de views IG/TikTok
- Últimos 10 reels/vídeos. Se não for possível ver views sem login, usar a média de likes do Social Blade e anotar `based on avg likes`.

### 6.4 Atividade (vídeos recentes)
- **Ativo**: último upload há no máximo 30 dias.
- **Atenção**: último upload entre 30 e 90 dias. Pode aprovar se o resto for muito forte, anotar em Notes.
- **Inativo**: mais de 90 dias sem postar. Reprovar. (Exemplo real: Reliance Bros, sem upload desde abril de 2025.)

### 6.5 Proporção views / inscritos **[Regra Marie: "boas views em relação aos inscritos"]**
- Proporção = média de views dos vídeos longos / inscritos.
- **Boa**: 10% ou mais.
- **Aceitável**: entre 3% e 10%.
- **Fraca**: abaixo de 3% (canal com audiência "morta"). Reprovar, a menos que o conteúdo-gatilho seja muito forte.

### 6.6 Faixa de tamanho **[Padrão ajustável]**
- Preferência: **10K a 600K** inscritos/seguidores.
- Abaixo de 10K: reprovar como "Too small" (exemplos reais: Wandering Prepper 5.8K, Single Girls DIY 6K).
- Acima de 600K: pode aprovar, mas anotar "large, may be expensive".
- Em Red Alert, a relevância e a data do conteúdo pesam mais que o tamanho.

---

## 7. Checagem de duplicidade (obrigatória)

Para **cada** candidato, checar nos três lugares:

### 7.1 Monday board
- Board: `mirasafety-team.monday.com/boards/18359348579` ("Affiliate Partnership Tracking").
- Usar o campo "Search this board".
- Buscar por: **nome do canal**, **handle** (sem @), **nome real** (se houver) e **parte única do nome** (ex.: "Doug & Stacy" e também "Doug and Stacy" e "OffGrid").
- Resultado "No results found" para todas as variações: livre.
- Qualquer resultado: abrir o item e confirmar se é a mesma pessoa. Se for, é duplicado.

### 7.2 Planilha principal
- Buscar em **toda** a planilha (Ctrl+F ou leitura completa), não só no bloco do Ian.
- Comparar nome, handle e links (o link do canal é o identificador mais confiável).

### 7.3 Rounds anteriores e afiliados atuais
- Conferir abas anteriores da planilha de trabalho.
- Conferir se o criador já usa código/link da MIRA (ex.: Christian Warrior Prepper usava o código CWT no próprio post: reprovado como afiliado existente).

### 7.4 Normalização para comparar nomes
Antes de comparar, o sistema deve:
- Converter para minúsculas.
- Remover `@`, espaços, pontuação, "the", "official", "tv", "channel".
- Trocar `&` por `and`.
- Comparar também por URL do canal (channel ID do YouTube é único).

### 7.5 Registro do resultado
Na coluna "Duplicate Check" escrever:
- `Clear (not on Monday or outreach sheet)` ou
- `Duplicate` ou
- `Duplicate, already a MIRA affiliate` ou
- `Duplicate, already a paid affiliate`.

---

## 8. Critérios de aprovação

### 8.1 Reprovação automática (qualquer um reprova)
1. Duplicado (Monday, planilha, rounds, afiliado atual).
2. Sem forma de contato (sem e-mail e sem Instagram/TikTok).
3. Inativo há mais de 90 dias.
4. Abaixo de 10K seguidores na plataforma principal.
5. Mídia, jornal, agregador ou loja (não é criador).
6. Risco de marca ou vende concorrente.
7. Recusa publicamente patrocínio.
8. O apresentador original saiu do canal (exemplo real: Iridium242).
9. Dados centrais impossíveis de verificar (vídeo-gatilho ou data não confirmados).
10. Sem ligação com o tema da Round.

### 8.2 Critérios de qualidade (para ranquear quem passou)
| Critério | Peso sugerido |
|---|---|
| Conteúdo-gatilho forte e específico (ex.: gift guide de preparedness, vídeo citando FORTRESS) | Alto |
| Proporção views/inscritos boa (10% ou mais) | Alto |
| Postagem recente e frequente | Alto |
| Audiência compatível com máscaras de gás/filtros (preppers, militares, famílias preparadas) | Alto |
| Tem e-mail comercial | Médio |
| Já faz parcerias com outras marcas (aceita patrocínio) | Médio |
| Crescimento recente (Social Blade) | Médio |
| Presença em várias plataformas | Baixo |

### 8.3 Critérios específicos por tipo de Round
- **AI/animação (Round 20)** **[Regra Marie]**: criador tem que narrar (para poder falar dos respiradores); sem ASMR puro; sem edição de filmagem real; sem gaming; sem review de pessoas reais.
- **Family Preparedness (Round 21)**: precisa ter ângulo família E conteúdo de presente/gift guide ou kit 72h.
- **Red Alert (Round 25)**: precisa ter postado sobre a notícia dentro da janela de tempo; colocar título, link e data do post.

### 8.4 Status possíveis
- `Approved`
- `Maybe` (passa nos filtros, mas tem um ponto fraco; explicar em "Why")
- `Not approved` (sempre com motivo curto em "Why")

---

## 9. Planilha de trabalho (aba da Round)

Arquivo: `Round20_AI_Tactical_Prepper_Creators`. Cada Round ganha uma aba nova, nome no formato `Round XX - Tema` (ex.: `Round 25 - Operation Fortress`).

### 9.1 Colunas (padrão das Rounds 21 e 25)
1. Name of Account
2. Status (Approved / Maybe / Not approved)
3. Why (final filter): motivo em 1 linha
4. Supervisor Feedback (vazio, para a Marie)
5. Niche ou Family Angle (1 linha)
6. Duplicate Check (Monday + Outreach sheet)
7. Conteúdo-gatilho (título + link + data)
8. Instagram
9. Instagram Followers
10. TikTok
11. TikTok Followers
12. YouTube
13. YouTube Subscribers
14. YouTube Views (last 28 days) ou outra plataforma
15. Last Upload / Posted On
16. Email
17. YouTube Business Email
18. Website
19. Other Links
20. Best Contact Method
21. Specific Message
22. Additional Notes

### 9.2 Organização
- Aprovados no topo, depois Maybe, depois reprovados (com motivo).
- Cores no nome **[convenção da Marie]**: verde = aprovado, laranja = maybe, vermelho = filtrado/reprovado, azul = novos candidatos aguardando revisão.
- Dado não confirmado: escrever `Not verified`. Nunca inventar número.

---

## 10. Planilha principal

Arquivo: "Potential New Affiliates on Instagram, YouTube and TikTok" (`docs.google.com/spreadsheets/d/1N3ZA7jCSv4rbJfBGKgZGmJvJEDcWL-1H`).

### 10.1 Onde escrever
- Cada Round tem um cabeçalho e blocos por estagiário: `Ian:`, `Laura:`, `Kevin:` etc.
- O sistema escreve **somente no bloco do Ian**, logo abaixo da linha `Ian:`.
- Se o bloco não tiver linhas vazias suficientes, **inserir linhas** dentro do bloco do Ian (nunca escrever por cima do bloco de outra pessoa).
- Novas Rounds ficam no topo da planilha (a Round mais recente aparece primeiro).

### 10.2 Colunas (C até N)
| Coluna | Campo | Formato |
|---|---|---|
| C | Name | nome do canal (igual ao da planilha de trabalho) |
| D | Followers | seguidores IG/TikTok (ex.: `45K`) |
| E | Link | link IG/TikTok |
| F | Avg IG/TT views | média (seção 6.3) |
| G | YouTube? | `Yes` / `No` |
| H | YT Followers | inscritos (ex.: `184K`) |
| I | YT Link | link do canal |
| J | Avg Video Views | média de vídeos longos (seção 6.1) |
| K | Avg Shorts | média de Shorts (seção 6.2) |
| L | Additional Notes | conteúdo-gatilho, ângulo, e-mail, observações |
| M | DM/E-mail | `Email` ou `DM` |
| N | Specific Message | mensagem pronta (seção 12) |

### 10.3 Ao inserir
- Texto em **preto** (a Marie é quem pinta de verde ou vermelho).
- Só enviar para a planilha principal os criadores com status `Approved` (e `Maybe` se a Marie pedir).
- Não deixar linhas vazias no meio do bloco.

---

## 11. Revisão da supervisora

### 11.1 Leitura das cores na planilha principal
- **Verde** = aprovado: pode escrever a mensagem.
- **Vermelho** = recusado: **apagar a linha inteira** (não só limpar o texto).
- **Preto** = ainda não revisado: não fazer nada, aguardar.

### 11.2 Notas da Marie
- A Marie pode deixar notas na coluna N ou no nome (ex.: "Legally Armed America (see notes)").
- O sistema deve **ler a nota antes de escrever a mensagem** e adaptar o texto. Exemplo real: o criador já era afiliado, sem venda há mais de um ano, e o link dele ainda gerava cliques. A mensagem virou uma mensagem de reativação, não de primeiro contato.
- Depois de usar a nota, a mensagem substitui a nota na coluna N.

### 11.3 Ao apagar linhas
- Apagar linhas muda o número de todas as linhas abaixo. O sistema deve **reler a planilha** depois de apagar e localizar cada criador **pelo nome**, nunca por número de linha salvo antes.

---

## 12. Mensagens de abordagem (assinadas por Bryce)

### 12.1 Regras gerais
- Remetente: **Bryce**, MIRA Safety.
- **Nunca usar travessão (em dash)**. Usar vírgula, ponto ou dois pontos.
- Saudação com o **primeiro nome real só se verificado**. Se não houver nome verificado, usar o nome do canal (ex.: "Hey Prepper Dawg," ou "Hey Civilian Rifleman team,").
- Citar **um conteúdo específico e real** do criador (título do vídeo/post), com uma frase curta e verdadeira sobre ele. Nunca inventar detalhes do vídeo.
- Ligar o produto ao público do criador em meia frase.
- Duas ideias concretas de colaboração, adaptadas ao formato do criador (vídeo de review, segmento em live, item no gift guide, unboxing no TikTok, episódio de podcast, item no checklist).
- Terminar com pergunta de interesse + link do Calendly: `https://calendly.com/bryce-g-mirasafety/30min`.
- Variar as frases de fechamento entre mensagens (3 variações em rotação) para não ficarem idênticas.
- Mensagem em inglês.

### 12.2 Template de E-mail
```
Subject: Potential Collaboration with MIRA Safety

Hey {Nome verificado ou Nome do canal},

Bryce here from MIRA Safety. I recently came across your {video/post} "{título}" and {comentário curto e verdadeiro sobre o conteúdo}.

We make gas masks, respirators, filters and other emergency preparedness gear, {ligação com o público do criador}.

We'd love to explore a potential collaboration with you! One idea is {ideia 1}. Another is {ideia 2}. {frase "aberto a ideias"}

{fechamento com pergunta + Calendly}

Talk soon,
Bryce
```

Frases "aberto a ideias" (rodar):
1. We're also happy to hear any ideas you have!
2. We're open to your ideas as well!
3. Of course, we're open to your ideas too!

Fechamentos (rodar):
1. Would you be interested in collaborating with us? If so, feel free to grab a time for a quick chat here: {CAL}
2. Would you be open to working together? If it sounds good, you can grab a time for a quick call here: {CAL}
3. Is this something you'd be interested in? If so, feel free to book a quick chat here: {CAL}

### 12.3 Template de DM (Instagram/TikTok)
```
Hey {Nome}! Bryce from MIRA Safety here. I recently came across your {video/post} on {assunto} and {comentário curto}. We make gas masks, respirators, filters and other emergency preparedness gear, and we'd love to explore a potential collaboration with you! One idea is {ideia 1}, and another is {ideia 2}. Would you be interested? If so, here's my calendar: {CAL}
```

### 12.4 Exemplo real (e-mail)
```
Subject: Potential Collaboration with MIRA Safety

Hey Steve,

Bryce here from MIRA Safety. I recently came across your livestream on the Pentagon preparing for a 90-day grid attack, and I liked how you tied the news back to what your viewers can actually do.

We make gas masks, respirators, filters and other emergency preparedness gear, and your audience already thinks about stocking up for hard times.

We'd love to explore a potential collaboration with you! One idea is a segment on your stockpile list where gas masks and filters are part of the plan. Another is a sponsored spot in one of your livestreams covering how to choose a gas mask. We're also happy to hear any ideas you have!

Would you be interested in collaborating with us? If so, feel free to grab a time for a quick chat here: https://calendly.com/bryce-g-mirasafety/30min

Talk soon,
Bryce
```

### 12.5 Caso especial: afiliado antigo (reativação)
Quando a Marie indicar que o criador já é afiliado:
- Assunto: `Reconnecting on MIRA Safety Content`.
- Abrir reconhecendo a parceria anterior.
- Mencionar que o link de afiliado dele **continua gerando cliques** (nunca mencionar falta de vendas de forma negativa).
- Propor voltar a criar conteúdo de preparedness ligado ao tema da Round.
- Mesmo fechamento com Calendly.

### 12.6 Ideias de colaboração por formato
| Formato do criador | Ideia 1 | Ideia 2 |
|---|---|---|
| YouTube review/prepper | review prático de uma máscara | máscara + filtros dentro do kit dele |
| Live/notícias | segmento patrocinado na live | lista de estoque com máscara e filtros |
| Família/homestead | kit de emergência da família com máscara | máscara no gift guide de fim de ano |
| IG/TikTok | unboxing curto | vídeo "o que tem no meu kit" |
| Substack/blog/podcast | episódio/artigo sobre proteção respiratória | máscara no checklist de preparedness |

---

## 13. Monday (quando a Marie pedir)
- Adicionar cada aprovado no grupo **New Leads**.
- Campos: nome do criador, **Niche** (ex.: `AI Content Creator`, `Family Preparedness`, `Prepper`), **Intern Name** = `Ian`, e-mail, primeiro nome (para personalizar).
- Antes de adicionar, rodar de novo a busca de duplicidade (seção 7.1).

---

## 14. EOD
Formato fixo, curto, em inglês, uma linha por item:
```
EOD:
Done: {o que foi feito, em uma frase}
Next: {próximo passo}
Blockers/Questions: None
```
Exemplo: `Done: Added the creators for Round 25 and Round 21 to the sheet and drafted the outreach messages for both rounds` / `Next: Send the outreach messages`.

---

## 15. Regras de segurança (o sistema nunca pode quebrar)
1. **Não contatar** nenhum criador sem aprovação. O envio é uma etapa separada.
2. **Não fazer login** em contas de terceiros nem resolver captchas.
3. **Nunca inventar** números, nomes, e-mails, títulos de vídeo ou datas. Se não confirmou, escreve `Not verified`.
4. **Nunca usar nome real deduzido do e-mail** (ex.: `trang06031995@gmail.com` não confirma que o nome é Trang).
5. Escrever **só no bloco do Ian** da planilha principal.
6. **Não apagar** nada além das linhas marcadas em vermelho pela Marie.
7. Localizar linhas **pelo nome**, nunca por número de linha guardado de antes.
8. **Sem travessão** em nenhum texto.

---

## 16. Erros comuns e como evitar
| Erro | Prevenção |
|---|---|
| Criador repetido | checar Monday + planilha inteira + rounds, com nomes normalizados e URL |
| Mensagem colada na linha errada depois de apagar uma linha | reler a planilha e casar por nome |
| Pular uma linha porque o nome tem sufixo (ex.: "(see notes)") | comparar por "começa com" o nome, não igualdade exata, e ler a nota |
| Formato de views mudou no YouTube ("12 thousand views" vs "12K views") | parser que aceita os dois formatos |
| Canal "ativo" com host diferente | conferir se o apresentador dos vídeos recentes é o mesmo |
| Média inflada por um viral | regra de outlier (seção 6.1) |
| Conteúdo-gatilho antigo em Round Red Alert | conferir a data dentro da janela |

---

## 17. Saída estruturada por criador (para o sistema)

Exemplo ilustrativo do formato (valores parciais):

```json
{
  "round": 25,
  "name": "Steve Ram",
  "status": "Approved",
  "why": "Economy/prepper news channel, livestream on Pentagon 90-day grid prep",
  "niche": "Economy / prepper news",
  "duplicate_check": "Clear (not on Monday or outreach sheet)",
  "trigger_content": {"title": "BREAKING | PENTAGON PREPS FOR 90-DAY GRID ATTACK ON U.S. SOIL!", "url": "https://www.youtube.com/watch?v=vAt452-S43c", "date": "YYYY-MM-DD"},
  "real_first_name": {"value": "Steve", "verified": true, "source": "channel name"},
  "platforms": {
    "youtube": {"url": "https://www.youtube.com/channel/UC_9iG1I_ic5jUOyzR9vTMBg", "subscribers": "Not verified", "avg_video_views": null, "avg_shorts_views": null, "last_upload": "YYYY-MM-DD"},
    "instagram": {"url": null, "followers": null, "avg_views": null},
    "tiktok": {"url": null, "followers": null, "avg_views": null}
  },
  "metrics": {"views_to_subs_ratio": null, "activity": "Active"},
  "contact": {"email": null, "youtube_business_email": true, "website": null, "best_method": "Email"},
  "mira_mention": false,
  "other_brand_deals": "very open to sponsors",
  "notes": "",
  "message_type": "email",
  "message": "..."
}
```

Campos sem dado confirmado ficam `null` ou `"Not verified"`, nunca preenchidos com estimativa.

---

## 18. Checklist final por criador
- [ ] Não está na lista de exclusão
- [ ] Duplicidade checada no Monday (nome, handle, nome real, variações)
- [ ] Duplicidade checada na planilha principal inteira
- [ ] Conteúdo-gatilho com título, link e data
- [ ] Último upload dentro de 30 dias (ou justificado)
- [ ] Média de views calculada com a regra da seção 6
- [ ] Proporção views/inscritos calculada
- [ ] Forma de contato encontrada (e-mail ou IG/TikTok)
- [ ] Nome real só se verificado
- [ ] Status + motivo preenchidos
- [ ] Inserido no bloco do Ian, em preto
- [ ] Mensagem só depois do verde da Marie
