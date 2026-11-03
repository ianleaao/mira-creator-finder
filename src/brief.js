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
// Correção dos filtros do Ian: cada busca combina TEMA + NICHO da MIRA. Termos de produto
// genéricos (mask, respirator, filter, review, gear, kit) são permitidos em até 1/3 das buscas,
// porque quem faz review de máscara é público ideal. Proibido só: nomes de marcas concorrentes.

const { readJson } = require('./round');
const { COMPETITORS } = require('./niche');

const MIN_QUERIES = 8;
const MAX_QUERIES = 15;

// Termos de produto genéricos: no máximo 1/3 das buscas.
const PRODUCT_TERMS = [
  'review', 'reviews', 'best', 'unboxing', 'vs', 'versus', 'tested', 'test',
  'mask', 'masks', 'gas mask', 'respirator', 'respirators', 'n95', 'n99', 'p100', 'kn95', 'ffp2',
  'filter', 'filters', 'cartridge', 'purifier', 'purifiers', 'air purifier', 'hepa', 'gear', 'kit', 'kits',
];

// Marcas proibidas em qualquer busca: concorrentes (niche.js) e outras marcas de produto.
const BANNED_BRANDS = [...COMPETITORS.map((b) => b.toLowerCase()), 'dyson', 'coway', 'levoit', 'blueair', 'vogmask'];

function words(query) {
  return ` ${String(query).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
}

// Termos de produto genéricos encontrados numa busca.
function productTerms(query) {
  const text = words(query);
  return PRODUCT_TERMS.filter((term) => text.includes(` ${term} `));
}

// Marcas proibidas encontradas numa busca.
function bannedBrands(query) {
  const text = words(query);
  return BANNED_BRANDS.filter((brand) => text.includes(` ${brand} `));
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

  const brands = queries.map((q) => ({ q, found: bannedBrands(q) })).filter((x) => x.found.length);
  if (brands.length) {
    const lines = brands.map((x) => `  - "${x.q}" (${x.found.join(', ')})`);
    throw new Error(`Buscas com nome de marca não são permitidas:\n${lines.join('\n')}`);
  }

  const product = queries.filter((q) => productTerms(q).length);
  const maxProduct = Math.floor(queries.length / 3);
  if (product.length > maxProduct) {
    const lines = product.map((q) => `  - "${q}" (${productTerms(q).join(', ')})`);
    throw new Error(`Termos de produto em ${product.length} de ${queries.length} buscas; o limite é 1/3 (${maxProduct}):\n${lines.join('\n')}`);
  }

  if (queries.length < MIN_QUERIES) {
    console.warn(`Aviso: só ${queries.length} buscas válidas (o SOP pede de ${MIN_QUERIES} a ${MAX_QUERIES}).`);
  }
  if (data.queries.length > MAX_QUERIES) {
    console.warn(`Aviso: ${data.queries.length} buscas recebidas, usando só as ${MAX_QUERIES} primeiras.`);
  }
  return { niche: data.niche || '', triggerContent: data.trigger_content || '', queries };
}

module.exports = { loadQueries, cleanQueries, productTerms, bannedBrands, MIN_QUERIES, MAX_QUERIES };
