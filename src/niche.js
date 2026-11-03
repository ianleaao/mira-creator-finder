// Nicho da MIRA (correção dos filtros do Ian): a MIRA quer creators DO NICHO DELA que falam do tema.
// Nicho: preparedness/prepper, survival, homesteading/off-grid, outdoor, tactical/firearms,
// militares e veteranos, bombeiros e emergência, segurança da família, saúde/qualidade do ar.

// Palavras do nicho procuradas nos títulos (niche_score).
const NICHE_TERMS = [
  'prep', 'prepper', 'preppers', 'prepping', 'preparedness', 'prepared', 'survival', 'survive', 'surviving',
  'homestead', 'homesteading', 'homesteader', 'off grid', 'off-grid', 'offgrid', 'self reliance', 'self-reliance', 'self sufficient',
  'bug out', 'bugout', 'go bag', 'get home bag', 'emergency', 'disaster', 'shtf', 'grid down', 'power outage', 'blackout',
  'food storage', 'stockpile', 'pantry', 'gear', 'tactical', 'edc', 'everyday carry', 'kit', 'first aid', 'trauma',
  'firearm', 'firearms', 'gun', 'guns', 'rifle', 'pistol', 'ammo', 'shooting', 'hunting', 'bushcraft', 'camping', 'outdoors', 'outdoor', 'wilderness',
  'military', 'veteran', 'veterans', 'army', 'marine', 'marines', 'navy', 'soldier',
  'firefighter', 'firefighting', 'wildland', 'wildfire', 'wildfires', 'fire season', 'wildfire smoke', 'smoke season', 'smoke day', 'smoky air', 'evacuation', 'evacuate',
  'air quality', 'gas mask', 'respirator', 'nbc', 'cbrn', 'nuclear', 'fallout', 'radiation', 'pandemic',
  'hurricane', 'flood', 'earthquake', 'tornado', 'storm',
];

function hasNicheTerm(title) {
  const text = ` ${String(title || '').toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ')} `;
  return NICHE_TERMS.some((term) => text.includes(` ${term} `));
}

// Quantos títulos (dos últimos 15) têm palavras do nicho.
function nicheScore(titles) {
  return titles.slice(0, 15).filter(hasNicheTerm).length;
}

// topicCategories do YouTube vêm como links da Wikipédia; fica o nome do fim do link.
function topicNames(urls) {
  return (urls || []).map((u) => decodeURIComponent(String(u).split('/').pop()).replace(/_/g, ' '));
}

// Categorias só de entretenimento: games, música, humor, filmes, TV.
function isEntertainmentTopic(name) {
  const n = name.toLowerCase();
  return /\b(video game culture|video game|game|gaming|music|entertainment|humour|humor|comedy|film|television program|movies?)\b/.test(n);
}

function onlyEntertainment(topics) {
  return topics.length > 0 && topics.every(isEntertainmentTopic);
}

// Marcas concorrentes (respiradores, máscaras de gás, filtros).
const COMPETITORS = ['3M', 'Honeywell', 'MSA', 'Avon Protection', 'Avon', 'Mestel', 'Parcil', 'GVS', 'Moldex', 'Draeger', 'Drager'];

// Marcas concorrentes citadas nos textos (descrição do canal e dos vídeos). É pista para o julgamento.
function competitorMentions(texts) {
  const found = new Set();
  for (const text of texts) {
    const t = String(text || '');
    for (const brand of COMPETITORS) {
      const re = new RegExp(`(^|[^A-Za-z0-9])${brand.replace(/ /g, '\\s+')}($|[^A-Za-z0-9])`, brand === 'MSA' || brand === '3M' || brand === 'GVS' ? '' : 'i');
      if (re.test(t)) found.add(brand.startsWith('Avon') ? 'Avon' : brand.replace('Drager', 'Draeger'));
    }
  }
  return [...found];
}

module.exports = { NICHE_TERMS, COMPETITORS, hasNicheTerm, nicheScore, topicNames, onlyEntertainment, competitorMentions };
