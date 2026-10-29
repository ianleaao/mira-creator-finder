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

## Estrutura

- `server.js`: servidor Express.
- `src/`: lógica (busca, métricas, duplicidade, classificação, mensagens).
- `public/`: página web (HTML, CSS e JavaScript puro).
- `output/`: CSVs gerados localmente (fora do git).
- `docs/SOP.md`: o processo que o sistema automatiza.
