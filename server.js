// Servidor Express. Na Fase 0 ele só sobe e serve a página inicial.
// Rotas de jobs e autenticação por senha entram na Fase 4.

const path = require('path');
const express = require('express');
const { reportKeys } = require('./src/config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`MIRA Creator Finder rodando em http://localhost:${PORT}`);
  reportKeys();
});
