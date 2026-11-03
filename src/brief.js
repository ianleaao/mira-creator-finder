// Lê e valida as buscas da Round (queries.json), escritas pelo Claude na sessão
// a partir do tema e do SOP (seções 1 e 3.2).
//
// Formato esperado:
// {
//   "niche": "uma linha",
//   "mira_angle": "uma linha: por que o tema importa para a MIRA",
//   "trigger_content": "uma linha: que tipo de vídeo conta como gatilho",
//   "niche_keywords": ["15 a 30 palavras do nicho e do tema"],
//   "queries": ["busca 1", "busca 2", ...]   (8 a 15)
// }
//
// Guia do CLAUDE.md: cada busca combina TEMA + NICHO da MIRA. Termos de produto genéricos
// (mask, respirator, filter, review, gear, kit) são permitidos em até 1/3 das buscas.
// Proibidos só nomes de marcas (MIRA e concorrentes). mira_angle e niche_keywords são obrigatórios.

const { readJson } = require('./round');
const { COMPETITORS, CORE_NICHE_KEYWORDS, ADJACENT_NICHE_KEYWORDS, PREP_KEYWORDS } = require('./niche');

const MIN_QUERIES = 8;
const MAX_QUERIES = 15;

// Termos de produto genéricos: no máximo 1/3 das buscas.
const PRODUCT_TERMS = [
  'review', 'reviews', 'best', 'unboxing', 'vs', 'versus', 'tested', 'test',
  'mask', 'masks', 'gas mask', 'respirator', 'respirators', 'n95', 'n99', 'p100', 'kn95', 'ffp2',
  'filter', 'filters', 'cartridge', 'purifier', 'purifiers', 'air purifier', 'hepa', 'gear', 'kit', 'kits',
];

// Marcas proibidas em qualquer busca: a própria MIRA, concorrentes (niche.js) e outras marcas de produto.
const BANNED_BRANDS = ['mira', 'mira safety', 'mirasafety', ...COMPETITORS.map((b) => b.toLowerCase()), 'avon', 'dyson', 'coway', 'levoit', 'blueair', 'vogmask'];

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

// A busca tem termo do nicho (central, adjacente, preparação ou niche_keywords da Round)?
function hasNicheTerm(query, nicheKeywords = []) {
  const text = words(query);
  return [...CORE_NICHE_KEYWORDS, ...ADJACENT_NICHE_KEYWORDS, ...PREP_KEYWORDS, ...nicheKeywords]
    .some((k) => text.includes(` ${String(k).toLowerCase()} `));
}

function loadQueries(file) {
  const data = readJson(file, 'buscas da Round');
  if (!Array.isArray(data.queries)) throw new Error(`${file}: o campo "queries" precisa ser uma lista.`);
  if (typeof data.mira_angle !== 'string' || !data.mira_angle.trim()) {
    throw new Error(`${file}: falta o campo "mira_angle" (por que o tema importa para a MIRA).`);
  }
  if (!Array.isArray(data.niche_keywords) || !data.niche_keywords.length) {
    throw new Error(`${file}: falta o campo "niche_keywords" (15 a 30 palavras do nicho e do tema).`);
  }
  const nicheKeywords = data.niche_keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean);
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

  const withNiche = queries.filter((q) => hasNicheTerm(q, nicheKeywords)).length;
  if (withNiche < queries.length / 2) {
    console.warn(`Aviso: só ${withNiche} de ${queries.length} buscas têm termo do nicho (o ideal é pelo menos metade).`);
  }
  if (nicheKeywords.length < 15 || nicheKeywords.length > 30) {
    console.warn(`Aviso: ${nicheKeywords.length} niche_keywords (o guia pede de 15 a 30).`);
  }
  if (queries.length < MIN_QUERIES) {
    console.warn(`Aviso: só ${queries.length} buscas válidas (o SOP pede de ${MIN_QUERIES} a ${MAX_QUERIES}).`);
  }
  if (data.queries.length > MAX_QUERIES) {
    console.warn(`Aviso: ${data.queries.length} buscas recebidas, usando só as ${MAX_QUERIES} primeiras.`);
  }
  return {
    niche: data.niche || '',
    miraAngle: data.mira_angle.trim(),
    triggerContent: data.trigger_content || '',
    nicheKeywords,
    queries,
    withNiche,
  };
}

module.exports = { loadQueries, cleanQueries, productTerms, bannedBrands, hasNicheTerm, MIN_QUERIES, MAX_QUERIES };
