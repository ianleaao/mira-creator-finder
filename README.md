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
Busca no YouTube, calcula métricas e aplica as regras. Gera `candidates.json` e `review.md`. **Na sessão**, peça ao Claude para ler o `review.md` e escrever o `judgments.json`.

```
node src/cli.js finalize "PENTAGON"
```
Junta tudo e gera o CSV na pasta da Round.

Opções do `new` (todas opcionais):
- `--round N`: número da Round (entra no nome da pasta e da planilha).
- `--target`: quantidade alvo (padrão 20). O sistema coleta cerca de 2x esse número.
- `--limit`: teto de canais coletados.
- `--red-alert`: só vídeos dentro da janela (padrão: últimos 30 dias). Mude com `--from 2026-09-30 --to 2026-10-28`.
- `--criteria "texto"`: critérios extras da Round (SOP 8.3), ex.: `--criteria "creator must narrate, no gaming"`.

**Modo de teste (ligado):** no máximo 3 buscas e 3 creators por Round, para não sobrecarregar. O limite fica em `TEST_MODE`, no `src/config.js`, e só sobe quando o sistema for aprovado.

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
