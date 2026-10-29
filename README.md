# MIRA Creator Finder

Sistema interno da MIRA Safety para encontrar, medir, filtrar e organizar creators para o programa de afiliados. O processo completo está em [docs/SOP.md](docs/SOP.md).

O script faz a parte determinística (YouTube, métricas, regras, duplicados, CSV). O julgamento (buscas, status, motivo, mensagens) é feito pelo Claude na sessão do Claude Code, lendo e escrevendo arquivos na pasta da Round. Não há custo de API de IA.

## Requisitos

- Node.js 22 ou mais novo (LTS)
- Chave da YouTube Data API v3
- Para a planilha principal e o Drive: login no Google (veja abaixo)

## Instalação

```
npm install
copy .env.example .env
```

Abra o `.env` no VS Code, cole cada chave depois do `=` e salve. Para conferir o que falta:

```
npm run check-env
```

O sistema funciona sem algumas chaves: ele avisa e pula só a parte que depende delas.

## Uma Round, passo a passo

```
node src/cli.js new "PENTAGON"
```
Cria `output/pentagon/`. Só o tema é obrigatório (opções abaixo). Depois, **na sessão**, peça ao Claude para escrever o `queries.json`.

```
node src/cli.js search "PENTAGON"
```
Roda as buscas em etapas: exclui quem já está na planilha do tema, descarta marcas, lojas, TV e jornais e governo (pré-filtro) antes de coletar, calcula métricas e aplica as regras. Gera `candidates.json` e `review.md`. **Na sessão**, o Claude lê o `review.md` e escreve o `judgments.json`. Se faltarem creators válidos, rodar `search` de novo: ele continua de onde parou.

```
node src/cli.js finalize "PENTAGON"
```
Junta tudo, gera o CSV na pasta da Round e atualiza a planilha do tema no Drive (mesmo tema = mesma planilha, com seções APPROVED, MAYBE e NOT APPROVED; nunca apaga linhas nem sobrescreve o que você editou).

Opções do `new` (todas opcionais):
- `--round N`: número da Round (entra no nome da pasta e da planilha).
- `--target`: creators válidos desejados (padrão 20; no modo de teste, 3).
- `--red-alert`: só vídeos dentro da janela (padrão: últimos 30 dias). Mude com `--from 2026-09-30 --to 2026-10-28`.
- `--criteria "texto"`: critérios extras da Round (SOP 8.3), ex.: `--criteria "creator must narrate, no gaming"`.

**Modo de teste (ligado):** cada Round entrega 3 creators válidos (Approved ou Maybe), usando as 8 a 15 buscas do SOP. O limite fica em `TEST_MODE`, no `src/config.js`, e só sobe quando o sistema for aprovado.

**Alarme de cota:** o `search` para antes de passar de 2.000 unidades do YouTube no dia. Para liberar mais: `node src/cli.js search "TEMA" --allow-quota 4000`.

**Buscas:** sobre o assunto do tema (vlog, experiência, preparação), nunca sobre produto. Buscas com review, best, mask, respirator ou marca são recusadas.

## Login no Google (uma vez)

1. Em console.cloud.google.com, no mesmo projeto da chave do YouTube, ative **Google Sheets API** e **Google Drive API** (APIs e serviços, Biblioteca).
2. Em "APIs e serviços", "Tela de permissão OAuth": tipo **Externo**, preencha nome do app e seu e-mail, e em "Usuários de teste" adicione o seu e-mail.
3. Em "Credenciais", "Criar credenciais", **ID do cliente OAuth**, tipo **App para computador**. Baixe o JSON.
4. Renomeie o arquivo para `google-oauth-client.json` e coloque na pasta do projeto (ele fica fora do git).
5. Rode:

   ```
   npm run google-auth
   ```

   O navegador abre, você entra com a sua conta e autoriza. O login fica salvo em `token.json` (fora do git).

Com o app em modo de teste, o Google pode pedir o login de novo depois de 7 dias. Se acontecer, rode `npm run google-auth` outra vez.

## Testes

```
npm test
```

Roda os testes das métricas, regras, duplicados e do fluxo completo sem chamar nenhuma API.

## Estrutura

- `src/cli.js`: comandos `new`, `search` e `finalize`.
- `src/sheet-template.js`: layout da saída (colunas, larguras, cores). Edite aqui para mudar a planilha.
- `src/`: resto da lógica (YouTube, métricas, regras, duplicados).
- `output/`: uma pasta por Round (fora do git).
- `docs/SOP.md`: o processo que o sistema automatiza.
