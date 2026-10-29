# MIRA Creator Finder

Sistema interno da MIRA Safety para encontrar, medir, filtrar e organizar creators para o programa de afiliados. O processo completo está em [docs/SOP.md](docs/SOP.md).

## Requisitos

- Node.js 22 ou mais novo (LTS)
- As chaves das APIs (veja abaixo)

## Como rodar

1. Instale as dependências:

   ```
   npm install
   ```

2. Copie o arquivo de exemplo e preencha as chaves:

   ```
   copy .env.example .env
   ```

   Abra o `.env` no VS Code e cole cada chave depois do `=`. Nunca faça commit do `.env`.

3. Confira quais chaves estão faltando:

   ```
   npm run check-env
   ```

   O sistema funciona sem algumas chaves: ele avisa e pula só a parte que depende delas.

4. Suba o servidor:

   ```
   npm start
   ```

   Abra `http://localhost:3000` no navegador.

## Buscar creators pelo terminal (Fase 1)

Precisa de `YOUTUBE_API_KEY` e `ANTHROPIC_API_KEY` no `.env`.

```
node src/cli.js "Pentagon FORTRESS" --round 25 --target 20 --red-alert --limit 10
```

- `--target`: quantidade alvo (padrão 20). O sistema coleta cerca de 2x esse número.
- `--limit`: teto de canais coletados (use 10 nos testes).
- `--red-alert`: só vídeos dentro da janela (padrão: últimos 30 dias). Mude com `--from 2026-09-30 --to 2026-10-28`.
- `--criteria "texto"`: critérios extras da Round em inglês (SOP 8.3), ex.: `--criteria "creator must narrate, no gaming"`.

O resultado vai para `output/` em CSV (abre no Excel) e JSON. No fim, o terminal mostra a cota do YouTube gasta e o custo do Claude.

## Testes

```
npm test
```

Roda os testes das métricas e do CSV sem chamar nenhuma API.

## Estrutura

- `server.js`: servidor Express.
- `src/`: lógica (busca, métricas, duplicidade, classificação, mensagens).
- `public/`: página web (HTML, CSS e JavaScript puro).
- `output/`: CSVs gerados localmente (fora do git).
- `docs/SOP.md`: o processo que o sistema automatiza.
