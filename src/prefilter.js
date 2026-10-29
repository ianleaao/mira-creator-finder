// Pré-filtro automático (SOP 4), ANTES de coletar vídeos (não gasta cota com eles).
// Descarta: marcas e fabricantes, lojas, emissoras de TV/rádio e jornais,
// órgãos de governo e canais institucionais. Usa só nome, handle e descrição do canal.
// Regras conservadoras: na dúvida, o canal passa e o julgamento na sessão decide.

// Marcas e fabricantes conhecidos (respiradores, filtros, purificadores, EPI).
const BRANDS = [
  '3m', 'honeywell', 'moldex', 'drager', 'draeger', 'msa safety', 'gvs', 'vogmask', 'cambridge mask',
  'envo mask', 'dyson', 'coway', 'levoit', 'blueair', 'winix', 'molekule', 'iqair', 'airthings',
  'mira safety', 'avon protection', 'scott safety', 'uline', 'grainger',
];

const RULES = [
  {
    reason: 'TV station, radio or newspaper',
    // Nome: "News", siglas de emissora americana (KREM, WFAA...), "Channel 7", "TV" junto de notícia.
    test: ({ name, rawName, description }) => /\bnews\b/.test(name)
      // Sigla de emissora americana toda em maiúsculas: KVUE, KREM, WFAA (opcionalmente seguida de cidade ou número).
      || /^[KW][A-Z]{3}\b/.test(rawName)
      || /\b[kw][a-z]{2,3}\b(?:[\s-]?(?:tv|\d{1,2}))/.test(name)
      || /\b(?:abc|nbc|cbs|fox|cnn|pbs|npr|msnbc|cbc|bbc)(?:\s?\d{1,2}\b|\s(?:news|tv)\b|$)/.test(name)
      || /\b(?:channel|tv)\s?\d{1,2}\b/.test(name)
      || /\b(?:newspaper|gazette|tribune|herald|chronicle|times|post|journal|broadcasting|television station|radio station)\b/.test(name)
      || /\b(?:local news|breaking news|latest news|news videos|news coverage|news channel|news station|news team|newsroom|weather team|first alert weather)\b/.test(description),
  },
  {
    reason: 'Government agency or institution',
    test: ({ name, description }) => /\b(?:county|city of|state of|department|dept|agency|government|ministry|fema|epa|usda|noaa|cal ?fire|forest service|national park|nps|blm|fire district|fire rescue|fire department|sheriff|police|public health|health department|university|college|school district|institute|foundation|association|council|commission)\b/.test(name)
      || /\.gov\b/.test(description)
      || /\bofficial (?:youtube )?channel of the\b/.test(description),
  },
  {
    reason: 'Brand or manufacturer',
    test: ({ name, handle, description }) => BRANDS.some((b) => new RegExp(`(^|[^a-z0-9])${b.replace(/ /g, '\\s?')}($|[^a-z0-9])`).test(`${name} ${handle}`))
      || /\b(?:inc|llc|ltd|corp|corporation|gmbh|manufacturing|industries)\b\.?$/.test(name)
      || /\b(?:we manufacture|our products|leading manufacturer|official channel of [a-z0-9 ]+ (?:inc|llc|company))\b/.test(description),
  },
  {
    reason: 'Store or retailer',
    test: ({ name, description }) => /\b(?:stores?|shops?|outlets?|supply|supplies|depot|mart|warehouse)\b/.test(name)
      || /\b(?:shop our|visit our store|free shipping on|use code .{0,20} at checkout on our)\b/.test(description),
  },
];

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Devolve o motivo do descarte ou null se o canal passa.
function prefilter(channel) {
  const fields = {
    rawName: String(channel.title || '').trim(),
    name: normalize(channel.title),
    handle: normalize(channel.handle).replace(/^@/, ''),
    description: normalize(channel.description).slice(0, 2000),
  };
  const rule = RULES.find((r) => r.test(fields));
  return rule ? `Pre-filter: ${rule.reason}` : null;
}

module.exports = { prefilter, BRANDS };
