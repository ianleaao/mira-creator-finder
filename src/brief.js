// Lê e valida as buscas da Round (queries.json), escritas pelo Claude na sessão
// a partir do tema e do SOP (seções 1 e 3.2).
//
// Formato esperado:
// {
//   "niche": "uma linha",
//   "trigger_content": "uma linha: que tipo de vídeo conta como gatilho",
//   "queries": ["busca 1", "busca 2", ...]   (8 a 15)
// }

const { readJson } = require('./round');

const MIN_QUERIES = 8;
const MAX_QUERIES = 15;

// Limpa as buscas: tira "site:", a palavra "youtube", espaços extras e repetidas.
function cleanQueries(queries) {
  const seen = new Set();
  const out = [];
  for (const raw of queries) {
    const q = String(raw)
      .replace(/site:\S+/gi, '')
      .replace(/\byoutube\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = q.toLowerCase();
    if (q && !seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  }
  return out.slice(0, MAX_QUERIES);
}

function loadQueries(file) {
  const data = readJson(file, 'buscas da Round');
  if (!Array.isArray(data.queries)) throw new Error(`${file}: o campo "queries" precisa ser uma lista.`);
  const queries = cleanQueries(data.queries);
  if (queries.length < MIN_QUERIES) {
    console.warn(`Aviso: só ${queries.length} buscas válidas (o SOP pede de ${MIN_QUERIES} a ${MAX_QUERIES}).`);
  }
  if (data.queries.length > MAX_QUERIES) {
    console.warn(`Aviso: ${data.queries.length} buscas recebidas, usando só as ${MAX_QUERIES} primeiras.`);
  }
  return { niche: data.niche || '', triggerContent: data.trigger_content || '', queries };
}

module.exports = { loadQueries, cleanQueries, MIN_QUERIES, MAX_QUERIES };
