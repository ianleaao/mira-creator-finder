// Lê e valida as buscas da Round (queries.json), escritas pelo Claude na sessão
// a partir do tema e do SOP (seções 1 e 3.2).
//
// Formato esperado:
// {
//   "niche": "uma linha",
//   "trigger_content": "uma linha: que tipo de vídeo conta como gatilho",
//   "queries": ["busca 1", "busca 2", ...]   (8 a 15)
// }
//
// Regra do Ian: o tema é o ASSUNTO do conteúdo (estilo de vida, experiência, preparação),
// nunca o produto. Buscas de review, "best", máscara, respirador ou marca são recusadas.

const { readJson } = require('./round');

const MIN_QUERIES = 8;
const MAX_QUERIES = 15;

// Termos de produto que não podem aparecer nas buscas.
const PRODUCT_TERMS = [
  'review', 'reviews', 'best', 'top 10', 'top 5', 'unboxing', 'vs', 'versus', 'buy', 'buying guide', 'budget',
  'mask', 'masks', 'respirator', 'respirators', 'gas mask', 'n95', 'n99', 'p100', 'kn95', 'ffp2',
  'filter', 'filters', 'cartridge', 'purifier', 'purifiers', 'air purifier', 'hepa',
  '3m', 'honeywell', 'moldex', 'mira safety', 'mirasafety', 'dyson', 'coway', 'levoit', 'blueair', 'vogmask',
];

// Devolve os termos de produto encontrados numa busca (lista vazia se ok).
function productTerms(query) {
  const text = ` ${String(query).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
  return PRODUCT_TERMS.filter((term) => text.includes(` ${term} `));
}

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

  const bad = queries.map((q) => ({ q, terms: productTerms(q) })).filter((x) => x.terms.length);
  if (bad.length) {
    const lines = bad.map((x) => `  - "${x.q}" (${x.terms.join(', ')})`);
    throw new Error(`Buscas sobre produto não são permitidas (o tema é o assunto do conteúdo):\n${lines.join('\n')}`);
  }
  if (queries.length < MIN_QUERIES) {
    console.warn(`Aviso: só ${queries.length} buscas válidas (o SOP pede de ${MIN_QUERIES} a ${MAX_QUERIES}).`);
  }
  if (data.queries.length > MAX_QUERIES) {
    console.warn(`Aviso: ${data.queries.length} buscas recebidas, usando só as ${MAX_QUERIES} primeiras.`);
  }
  return { niche: data.niche || '', triggerContent: data.trigger_content || '', queries };
}

module.exports = { loadQueries, cleanQueries, productTerms, MIN_QUERIES, MAX_QUERIES };
