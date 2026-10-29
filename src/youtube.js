// Busca de canais e coleta de vídeos via YouTube Data API v3.
// Cota grátis: 10.000 unidades por dia. search.list = 100; os outros = 1 por chamada.

const { google } = require('googleapis');
const { requireKey } = require('./config');

const quota = { units: 0, calls: 0 };

let api = null;
function yt() {
  if (!api) api = google.youtube({ version: 'v3', auth: requireKey('YOUTUBE_API_KEY') });
  return api;
}

// Motivo do erro devolvido pelo Google (ex.: "quotaExceeded", "playlistNotFound").
function errorReason(err) {
  const data = err && err.response && err.response.data;
  const first = data && data.error && data.error.errors && data.error.errors[0];
  return first ? first.reason : null;
}

// Chama a API contando a cota. Transforma erros comuns em mensagens claras.
async function call(units, fn) {
  quota.units += units;
  quota.calls += 1;
  try {
    const res = await fn();
    return res.data;
  } catch (err) {
    const reason = errorReason(err);
    // Erros que impedem continuar: param a Round inteira.
    const fatal = (message) => Object.assign(new Error(message), { fatal: true });
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw fatal('Cota diária da YouTube API esgotada. Ela renova à meia-noite do horário do Pacífico (cerca de 4h ou 5h no Brasil).');
    }
    if (reason === 'keyInvalid' || (err.response && err.response.status === 400 && /API key/i.test(err.message))) {
      throw fatal('YOUTUBE_API_KEY inválida. Confira a chave no .env.');
    }
    if (reason === 'accessNotConfigured') {
      throw fatal('A YouTube Data API v3 não está ativada no projeto do Google Cloud.');
    }
    err.reason = reason;
    throw err;
  }
}

// Busca vídeos para uma query. Devolve [{ videoId, channelId, channelTitle, title, publishedAt }].
async function searchVideos(query, { publishedAfter, publishedBefore, maxResults = 50 } = {}) {
  const params = {
    part: ['snippet'],
    q: query,
    type: ['video'],
    maxResults,
    relevanceLanguage: 'en',
  };
  if (publishedAfter) params.publishedAfter = publishedAfter;
  if (publishedBefore) params.publishedBefore = publishedBefore;

  const data = await call(100, () => yt().search.list(params));
  return (data.items || [])
    .filter((item) => item.id && item.id.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
    }));
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Dados de canais em lotes de 50 (1 unidade por lote).
async function getChannels(channelIds) {
  const result = [];
  for (const batch of chunks(channelIds, 50)) {
    const data = await call(1, () => yt().channels.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: batch,
      maxResults: 50,
    }));
    for (const ch of data.items || []) {
      const stats = ch.statistics || {};
      result.push({
        channelId: ch.id,
        title: ch.snippet.title,
        handle: ch.snippet.customUrl || null, // ex.: "@canal"
        description: ch.snippet.description || '',
        country: ch.snippet.country || null,
        subscribers: stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount),
        subscribersHidden: Boolean(stats.hiddenSubscriberCount),
        videoCount: Number(stats.videoCount || 0),
        uploadsPlaylist: ch.contentDetails && ch.contentDetails.relatedPlaylists
          ? ch.contentDetails.relatedPlaylists.uploads
          : null,
      });
    }
  }
  return result;
}

// IDs de vídeos de uma playlist, do mais novo para o mais antigo.
// Devolve null se a playlist não existir (ex.: canal sem Shorts).
async function getPlaylistVideoIds(playlistId, max = 50) {
  const ids = [];
  let pageToken;
  try {
    do {
      const data = await call(1, () => yt().playlistItems.list({
        part: ['contentDetails'],
        playlistId,
        maxResults: Math.min(50, max - ids.length),
        pageToken,
      }));
      for (const item of data.items || []) ids.push(item.contentDetails.videoId);
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < max);
  } catch (err) {
    if (err.reason === 'playlistNotFound' || (err.response && err.response.status === 404)) return null;
    throw err;
  }
  return ids;
}

// Converte duração ISO 8601 (PT1H2M3S) em segundos.
function durationSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

// Detalhes de vídeos em lotes de 50 (1 unidade por lote).
async function getVideos(videoIds) {
  const result = [];
  for (const batch of chunks(videoIds, 50)) {
    const data = await call(1, () => yt().videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: batch,
      maxResults: 50,
    }));
    for (const v of data.items || []) {
      const stats = v.statistics || {};
      result.push({
        videoId: v.id,
        title: v.snippet.title,
        description: v.snippet.description || '',
        url: `https://www.youtube.com/watch?v=${v.id}`,
        publishedAt: v.snippet.publishedAt,
        // "upcoming" = premiere ou live agendada; "live" = ao vivo agora.
        upcoming: v.snippet.liveBroadcastContent !== 'none',
        views: stats.viewCount === undefined ? null : Number(stats.viewCount),
        durationSeconds: durationSeconds(v.contentDetails && v.contentDetails.duration),
      });
    }
  }
  return result;
}

const LONG_CANDIDATES = 20;  // vídeos longos buscados (sobra para pular os de menos de 7 dias)
const SHORT_CANDIDATES = 20;

// Coleta vídeos longos e Shorts de um canal.
// Usa a playlist de uploads (UU...) para tudo e a playlist de Shorts (UUSH...) para separar.
// A playlist UUSH não é documentada oficialmente; se ela não existir, cai para a duração.
async function getChannelVideos(channel) {
  const uploads = channel.uploadsPlaylist || `UU${channel.channelId.slice(2)}`;
  const shortsPlaylist = `UUSH${channel.channelId.slice(2)}`;

  const [uploadIds, shortIds] = await Promise.all([
    getPlaylistVideoIds(uploads, 50),
    getPlaylistVideoIds(shortsPlaylist, SHORT_CANDIDATES),
  ]);

  const allUploads = uploadIds || [];
  const shortsSet = new Set(shortIds || []);
  const shortsSource = shortIds === null ? 'duration' : 'playlist';

  let longIds;
  let shortList;
  if (shortsSource === 'playlist') {
    longIds = allUploads.filter((id) => !shortsSet.has(id)).slice(0, LONG_CANDIDATES);
    shortList = shortIds.slice(0, SHORT_CANDIDATES);
  } else {
    // Sem playlist de Shorts: decide pela duração depois de ler os detalhes.
    longIds = allUploads.slice(0, LONG_CANDIDATES + SHORT_CANDIDATES);
    shortList = [];
  }

  const details = await getVideos([...new Set([...longIds, ...shortList])]);
  const byId = new Map(details.map((v) => [v.videoId, v]));

  let longVideos;
  let shortVideos;
  if (shortsSource === 'playlist') {
    longVideos = longIds.map((id) => byId.get(id)).filter(Boolean);
    shortVideos = shortList.map((id) => byId.get(id)).filter(Boolean);
  } else {
    const known = longIds.map((id) => byId.get(id)).filter(Boolean);
    shortVideos = known.filter((v) => v.durationSeconds !== null && v.durationSeconds <= 60);
    longVideos = known.filter((v) => !shortVideos.includes(v)).slice(0, LONG_CANDIDATES);
  }

  // Último upload: o vídeo publicado mais recente entre todos os coletados (sem agendados).
  const published = [...longVideos, ...shortVideos].filter((v) => !v.upcoming);
  const lastUpload = published.length
    ? published.reduce((a, b) => (new Date(a.publishedAt) > new Date(b.publishedAt) ? a : b)).publishedAt
    : null;

  return { longVideos, shortVideos, lastUpload, shortsSource };
}

module.exports = {
  quota,
  searchVideos,
  getChannels,
  getChannelVideos,
  durationSeconds,
};
