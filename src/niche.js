// Encaixe com a MIRA (CLAUDE.md, "Encaixe com a MIRA"; SOP, "Nicho MIRA").
// A MIRA quer creators DO NICHO DELA que falam do tema da Round.
//  - Nicho central: conta sozinho.
//  - Nicho adjacente (homestead, família, food storage, outdoor, rural): só conta com pelo menos
//    5 dos últimos 15 títulos sobre preparação. Comida, casa e rotina nunca contam.

// Palavras do NICHO CENTRAL (nome, descrição ou títulos): preparação, sobrevivência, tático,
// militares e veteranos, bombeiros e emergência, CBRN e qualidade do ar, notícias de preparação.
const CORE_NICHE_KEYWORDS = [
  'prepper', 'preppers', 'prepping', 'preparedness', 'survival', 'survivalist', 'bushcraft', 'shtf',
  'tactical', 'firearm', 'firearms', 'gun', 'guns', 'edc', 'everyday carry', 'gear review',
  'military', 'veteran', 'veterans', 'army', 'marine', 'marines', 'soldier', 'special forces',
  'firefighter', 'firefighters', 'firefighting', 'wildland', 'emergency response', 'emt', 'paramedic',
  'cbrn', 'nbc', 'gas mask', 'gas masks', 'respirator', 'respirators', 'air quality', 'hazmat',
];

// Palavras do NICHO ADJACENTE: só contam com preparação recorrente.
const ADJACENT_NICHE_KEYWORDS = [
  'homestead', 'homesteading', 'homesteader', 'off grid', 'off-grid', 'offgrid', 'family', 'families',
  'food storage', 'outdoor', 'outdoors', 'camping', 'rural', 'farm', 'self reliance', 'self-reliance',
];

// Títulos de PREPARAÇÃO (contam no niche_score).
const PREP_KEYWORDS = [
  'prep', 'prepper', 'preppers', 'prepping', 'preparedness', 'prepared', 'prepare', 'preparing',
  'survival', 'survive', 'surviving', 'bushcraft', 'shtf', 'emergency', 'emergencies', 'disaster', 'disasters',
  'bug out', 'bugout', 'bug-out', 'go bag', 'get home bag', 'kit', 'kits', 'edc', 'first aid', 'trauma',
  'blackout', 'power outage', 'grid down', 'grid-down', 'stockpile', 'food storage', 'water storage',
  'evacuation', 'evacuate', 'evacuating', 'evacuated', 'wildfire', 'wildfires', 'fire season', 'wildfire smoke',
  'smoke season', 'air quality', 'gas mask', 'gas masks', 'respirator', 'respirators', 'cbrn', 'nbc',
  'nuclear', 'fallout', 'radiation', 'pandemic', 'hurricane', 'flood', 'earthquake', 'tornado',
  'tactical', 'firearm', 'firearms', 'self defense', 'self-defense', 'military', 'veteran', 'war',
  'firefighter', 'wildland', 'collapse', 'crisis',
];

// Títulos de comida, casa e rotina: NUNCA contam, mesmo com "homestead" ou palavra de preparação.
const NOT_PREP_KEYWORDS = [
  'recipe', 'recipes', 'canning', 'canned', 'cooking', 'cook', 'cooks', 'kitchen', 'baking', 'bake', 'bread',
  'homemaking', 'homemaker', 'frugal', 'budget meals', 'meal prep', 'garden', 'gardening', 'harvest',
  'decor', 'decorating', 'cozy', 'mom life', 'motherhood', 'homeschool', 'cleaning', 'craft', 'crafts', 'sewing',
  'chicken', 'chickens', 'goats', 'pets', 'grocery', 'groceries', 'skincare', 'makeup',
];

// Categorias do YouTube fora do nicho.
const OFF_NICHE_TOPICS = ['gaming', 'video game', 'music', 'entertainment', 'comedy', 'humour', 'humor', 'film', 'movie'];

// Marcas concorrentes (máscaras de gás, respiradores, filtros).
const COMPETITORS = ['3M', 'Honeywell', 'MSA', 'Avon Protection', 'Mestel', 'Parcil', 'Moldex', 'GVS', 'Drager', 'Draeger'];

function words(text) {
  return ` ${String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ')} `;
}

function hasAny(text, keywords) {
  const t = words(text);
  return keywords.some((k) => t.includes(` ${String(k).toLowerCase()} `));
}

const titleOf = (t) => (typeof t === 'string' ? t : (t && t.title) || '');

// Título de preparação: tem palavra de preparação e nenhuma de comida, casa ou rotina.
function isPrepTitle(title, extraKeywords = []) {
  return hasAny(title, [...PREP_KEYWORDS, ...extraKeywords]) && !hasAny(title, NOT_PREP_KEYWORDS);
}

// niche_score: quantos dos últimos 15 títulos são de preparação. Devolve { count, total, label }.
// extraKeywords = niche_keywords da Round.
function nicheScore(titles, description = '', extraKeywords = []) {
  const list = (titles || []).slice(0, 15).map(titleOf);
  const count = list.filter((t) => isPrepTitle(t, extraKeywords)).length;
  return { count, total: list.length, label: `${count}/${list.length}` };
}

// O canal é do nicho central? Pelo nome e pela descrição. allowedNiches (da Round) contam como centrais.
function isCoreChannel({ name = '', description = '' }, allowedNiches = []) {
  const text = `${name} ${description}`;
  if (hasAny(text, CORE_NICHE_KEYWORDS)) return true;
  // Nomes grudados ("southernprepper1", "theurbanprepper"): palavras longas do nicho dentro do nome.
  const joined = String(name).toLowerCase().replace(/[^a-z]/g, '');
  if (CORE_NICHE_KEYWORDS.some((k) => !k.includes(' ') && k.length >= 7 && joined.includes(k))) return true;
  return allowedNiches.length > 0 && hasAny(text, allowedNiches);
}

// Perfil do canal: as 3 palavras mais frequentes dos últimos 15 títulos.
const STOPWORDS = new Set(('a an and are as at be by do for from get has have how i if in is it its my of on or our so that the this to up us we what when why with you your vs not no can will just more most out all new one two 1 2 3 4 5 10 shorts short part ep s e '
  + 'de da do em um uma para com').split(' '));
function channelProfile(titles) {
  const counts = new Map();
  for (const t of (titles || []).slice(0, 15).map(titleOf)) {
    for (const w of new Set(words(t).trim().split(' '))) {
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([w]) => w);
}

// topicCategories do YouTube vêm como links da Wikipédia; fica o nome do fim do link.
function topicNames(urls) {
  return (urls || []).map((u) => decodeURIComponent(String(u).split('/').pop()).replace(/_/g, ' '));
}

function isOffNicheTopic(name) {
  const n = String(name).toLowerCase();
  return OFF_NICHE_TOPICS.some((t) => n.includes(t)) || /\bgame\b/.test(n);
}

// Categorias só fora do nicho (Gaming, Music, Entertainment, Comedy, Film).
function onlyOffNicheTopics(topics) {
  return topics.length > 0 && topics.every(isOffNicheTopic);
}

// Algum título tem palavra do nicho (central, adjacente ou preparação)?
function anyNicheTitle(titles, extraKeywords = []) {
  const all = [...CORE_NICHE_KEYWORDS, ...ADJACENT_NICHE_KEYWORDS, ...PREP_KEYWORDS, ...extraKeywords];
  return (titles || []).map(titleOf).some((t) => hasAny(t, all));
}

// Marcas concorrentes citadas nos textos (descrições e títulos). Pista para o julgamento.
function competitorFlags(texts) {
  const found = new Set();
  for (const text of texts) {
    const t = String(text || '');
    for (const brand of COMPETITORS) {
      const caseSensitive = ['3M', 'MSA', 'GVS'].includes(brand);
      const re = new RegExp(`(^|[^A-Za-z0-9])${brand.replace(/ /g, '\\s+')}($|[^A-Za-z0-9])`, caseSensitive ? '' : 'i');
      if (re.test(t)) found.add(brand === 'Draeger' ? 'Drager' : brand);
    }
  }
  return [...found];
}

module.exports = {
  CORE_NICHE_KEYWORDS,
  ADJACENT_NICHE_KEYWORDS,
  PREP_KEYWORDS,
  NOT_PREP_KEYWORDS,
  OFF_NICHE_TOPICS,
  COMPETITORS,
  isPrepTitle,
  nicheScore,
  isCoreChannel,
  channelProfile,
  topicNames,
  onlyOffNicheTopics,
  anyNicheTitle,
  competitorFlags,
};
