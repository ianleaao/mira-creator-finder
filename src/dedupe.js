// Normalização e comparação para a checagem de duplicidade (SOP seção 7).
// Fontes (Monday, planilha principal) entram como uma lista de "entradas conhecidas":
// [{ name, links: [urls], source: 'monday' | 'sheet', detail: 'grupo ou aba' }]

const IGNORED_WORDS = ['the', 'official', 'tv', 'channel'];
const MIN_PREFIX = 6; // "começa com" só vale para nomes normalizados com 6+ letras

// SOP 7.4: minúsculas; & vira and; remove @, espaços, pontuação, "the", "official", "tv", "channel".
function normalizeName(text) {
  if (!text) return '';
  const words = String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/@/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !IGNORED_WORDS.includes(w));
  return words.join('');
}

// Extrai identificadores de um link: channel ID do YouTube, handles de YouTube/Instagram/TikTok.
function linkIds(url) {
  const ids = [];
  if (!url) return ids;
  const text = String(url).trim();
  const channel = text.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (channel) ids.push(`ytid:${channel[1]}`);
  const ytHandle = text.match(/youtube\.com\/@([\w.-]+)/i);
  if (ytHandle) ids.push(`yt:${normalizeName(ytHandle[1])}`);
  const ytLegacy = text.match(/youtube\.com\/(?:c|user)\/([\w.-]+)/i);
  if (ytLegacy) ids.push(`yt:${normalizeName(ytLegacy[1])}`);
  const ig = text.match(/instagram\.com\/([\w.]+)/i);
  if (ig && !['p', 'reel', 'reels', 'stories'].includes(ig[1].toLowerCase())) ids.push(`ig:${normalizeName(ig[1])}`);
  const tt = text.match(/tiktok\.com\/@([\w.]+)/i);
  if (tt) ids.push(`tt:${normalizeName(tt[1])}`);
  // Handle solto ("@prepperdawg") sem URL: vale como handle de qualquer plataforma.
  if (!ids.length && /^@[\w.]+$/.test(text)) ids.push(`handle:${normalizeName(text)}`);
  return ids;
}

// Monta o índice a partir das entradas conhecidas.
function buildIndex(entries) {
  const byId = new Map();
  const names = [];
  for (const entry of entries) {
    for (const link of entry.links || []) {
      for (const id of linkIds(link)) {
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(entry);
      }
    }
    const norm = normalizeName(entry.name);
    if (norm) names.push({ norm, entry });
  }
  return { byId, names, size: entries.length };
}

// Identificadores do creator (canal, handle, Instagram, TikTok).
function creatorIds(creator) {
  const yt = creator.platforms.youtube;
  const ids = new Set();
  if (yt.channel_id) ids.add(`ytid:${yt.channel_id}`);
  if (yt.handle) ids.add(`yt:${normalizeName(yt.handle)}`);
  for (const url of [yt.url, creator.platforms.instagram.url, creator.platforms.tiktok.url]) {
    for (const id of linkIds(url)) ids.add(id);
  }
  // Handles também podem estar soltos na fonte ("@canal"): compara com qualquer plataforma.
  for (const id of [...ids]) {
    const [kind, value] = id.split(':');
    if (kind !== 'ytid') ids.add(`handle:${value}`);
  }
  return ids;
}

// Nomes normalizados batem se forem iguais, ou se um começa com o outro
// (ex.: "Legally Armed America (see notes)"), desde que o menor tenha 6+ letras.
function namesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_PREFIX && long.startsWith(short);
}

// Procura o creator no índice. Devolve a lista de entradas encontradas e o motivo.
function findMatches(creator, index) {
  const found = new Map();
  for (const id of creatorIds(creator)) {
    for (const entry of index.byId.get(id) || []) {
      if (!found.has(entry)) found.set(entry, `link (${id.split(':')[0]})`);
    }
    // Handle de YouTube/IG/TikTok contra handle solto na fonte.
    const value = id.split(':')[1];
    for (const entry of index.byId.get(`handle:${value}`) || []) {
      if (!found.has(entry)) found.set(entry, 'handle');
    }
  }
  const myNames = [creator.name, creator.platforms.youtube.handle].map(normalizeName).filter(Boolean);
  for (const { norm, entry } of index.names) {
    if (!found.has(entry) && myNames.some((n) => namesMatch(n, norm))) found.set(entry, 'name');
  }
  return [...found.entries()].map(([entry, reason]) => ({ ...entry, reason }));
}

// Texto da coluna Duplicate Check (SOP 7.5), considerando quais fontes foram lidas.
// sources: { monday: boolean, sheet: boolean } indica se cada fonte foi checada.
function duplicateText(matches, sources) {
  if (matches.length) {
    if (matches.some((m) => m.affiliate === 'paid')) return 'Duplicate, already a paid affiliate';
    if (matches.some((m) => m.affiliate === 'mira')) return 'Duplicate, already a MIRA affiliate';
    return 'Duplicate';
  }
  if (sources.monday && sources.sheet) return 'Clear (not on Monday or outreach sheet)';
  if (sources.sheet) return 'Clear on outreach sheet, Monday not checked';
  if (sources.monday) return 'Clear on Monday, outreach sheet not checked';
  return 'Not checked (Monday and outreach sheet unavailable)';
}

module.exports = { normalizeName, linkIds, buildIndex, findMatches, namesMatch, duplicateText, creatorIds };
