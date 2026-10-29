// Orquestra as etapas de uma Round (só a parte determinística).
//   new       cria a pasta da Round e o round.json
//   search    lê queries.json, busca no YouTube, calcula métricas, aplica regras,
//             gera candidates.json e review.md
//   finalize  junta regras + judgments.json (+ messages.json) e gera o CSV
// O julgamento (buscas, status, motivo, mensagens) é feito pelo Claude na sessão.

const fs = require('fs');
const path = require('path');
const { loadQueries } = require('./brief');
const youtube = require('./youtube');
const metrics = require('./metrics');
const { requireKey, TEST_MODE } = require('./config');
const { applyJudgments, sortCreators, removeDashes } = require('./classify');
const { buildReview } = require('./review');
const { saveCsv } = require('./output');
const round = require('./round');

const MIN_SUBSCRIBERS = 10000;     // SOP 6.6 / 8.1: abaixo de 10K reprova
const LARGE_SUBSCRIBERS = 600000;  // SOP 6.6: acima disso, anotar "large, may be expensive"
const PARALLEL_CHANNELS = 5;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const MIRA_RE = /mira\s?safety|mirasafety\.com/i;

// Roda fn em cada item, no máximo `limit` ao mesmo tempo.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function unique(list) {
  return [...new Set(list)];
}

function cleanUrl(url) {
  return url.replace(/[.,;:!?]+$/, '');
}

// Itens que aparecem em pelo menos `min` textos diferentes (para não pegar link de patrocinador).
function recurring(texts, regex, min) {
  const counts = new Map();
  for (const text of texts) {
    for (const value of unique((text.match(regex) || []).map((v) => cleanUrl(v.toLowerCase())))) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

// Contato e links públicos: primeiro a descrição do canal; se faltar, o que se repete
// em 2 ou mais descrições de vídeos. Nunca deduz nada que não esteja escrito.
function extractContact(channel, videos) {
  const notes = [];
  const videoTexts = videos.map((v) => v.description);

  let email = (channel.description.match(EMAIL_RE) || [])[0] || null;
  if (!email) {
    email = recurring(videoTexts, EMAIL_RE, 2)[0] || null;
    if (email) notes.push('Email found in video descriptions');
  }

  const channelUrls = unique((channel.description.match(URL_RE) || []).map(cleanUrl));
  const videoUrls = recurring(videoTexts, URL_RE, 2);
  const pick = (re) => channelUrls.find((u) => re.test(u)) || videoUrls.find((u) => re.test(u)) || null;

  const instagram = pick(/instagram\.com\/(?!p\/|reel\/)[^/?#]+/i);
  const tiktok = pick(/tiktok\.com\/@[^/?#]+/i);
  const isOwnSocial = (u) => /youtube\.com|youtu\.be/i.test(u) || u === instagram || u === tiktok;
  const otherLinks = channelUrls.filter((u) => !isOwnSocial(u)).slice(0, 8);

  let bestMethod = null; // SOP 5.3
  if (email) bestMethod = 'Email';
  else if (instagram || tiktok) bestMethod = 'DM';

  return { email, instagram, tiktok, otherLinks, bestMethod, notes };
}

function channelUrl(channel) {
  return channel.handle
    ? `https://www.youtube.com/${channel.handle}`
    : `https://www.youtube.com/channel/${channel.channelId}`;
}

// Monta um creator no formato do SOP 17.
function buildCreator({ round, channel, collected, matches, now }) {
  const notes = [];
  const longAvg = metrics.averageViews(collected.longVideos, now);
  const shortAvg = metrics.averageViews(collected.shortVideos, now);
  const ratio = metrics.viewsToSubsRatio(longAvg.average, channel.subscribers);
  const act = metrics.activity(collected.lastUpload, now);
  const contact = extractContact(channel, [...collected.longVideos, ...collected.shortVideos]);

  if (longAvg.viral) {
    notes.push(`Viral excluded from avg: "${longAvg.viral.title}" (${metrics.formatCount(longAvg.viral.views)} views)`);
  }
  if (shortAvg.viral) {
    notes.push(`Viral Short excluded from avg: "${shortAvg.viral.title}" (${metrics.formatCount(shortAvg.viral.views)} views)`);
  }
  if (longAvg.count > 0 && longAvg.count < 10) notes.push(`Video avg based on ${longAvg.count} videos`);
  if (channel.subscribersHidden) notes.push('Subscriber count hidden');
  if (channel.subscribers !== null && channel.subscribers > LARGE_SUBSCRIBERS) notes.push('large, may be expensive');
  if (collected.shortsSource === 'duration') notes.push('Shorts detected by duration');
  if (collected.error) notes.push(`Could not collect videos: ${collected.error}`);
  notes.push(...contact.notes);

  const allText = [channel.description, ...collected.longVideos.map((v) => v.description)].join('\n');
  const miraMention = MIRA_RE.test(allText);
  if (miraMention) notes.push('Mentions MIRA Safety (check if already an affiliate)');

  const trigger = matches[0];

  return {
    round,
    name: channel.title,
    status: '',
    why: '',
    niche: '',
    duplicate_check: 'Not checked yet',
    trigger_content: trigger
      ? { title: trigger.title, url: `https://www.youtube.com/watch?v=${trigger.videoId}`, date: trigger.publishedAt.slice(0, 10) }
      : null,
    real_first_name: { value: null, verified: false, source: null },
    platforms: {
      youtube: {
        url: channelUrl(channel),
        channel_id: channel.channelId,
        handle: channel.handle,
        subscribers: channel.subscribers,
        avg_video_views: longAvg.average,
        avg_shorts_views: shortAvg.average,
        long_videos_found: collected.longVideos.length,
        last_upload: collected.lastUpload,
      },
      instagram: { url: contact.instagram, followers: null, avg_views: null },
      tiktok: { url: contact.tiktok, followers: null, avg_views: null },
    },
    metrics: {
      views_to_subs_ratio: ratio,
      activity: act.label,
      days_since_upload: act.days,
    },
    contact: {
      email: contact.email,
      youtube_business_email: null,
      website: null,
      other_links: contact.otherLinks,
      best_method: contact.bestMethod,
    },
    mira_mention: miraMention,
    other_brand_deals: null,
    notes,
    message_type: null,
    message: '',
    // Dados reais coletados, para a classificação da Fase 2.
    evidence: {
      channel_description: channel.description,
      search_matches: matches.slice(0, 5).map((m) => ({
        title: m.title,
        url: `https://www.youtube.com/watch?v=${m.videoId}`,
        date: m.publishedAt.slice(0, 10),
        query: m.query,
      })),
      recent_titles: collected.longVideos.slice(0, 10).map((v) => v.title),
    },
  };
}

// Janela padrão do Red Alert: últimos 30 dias.
function defaultWindow(now) {
  const from = new Date(now.getTime() - 30 * 86400000);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

// Cria a pasta da Round e o round.json.
function newRound(options) {
  const now = new Date();
  const { theme, redAlert = false } = options;
  const dir = path.join(round.OUTPUT_DIR, round.roundDirName(options.round, theme));
  const f = round.files(dir);
  if (fs.existsSync(f.round)) {
    throw new Error(`A Round já existe: ${dir}. Apague a pasta ou use outro número/tema.`);
  }

  // Modo de teste: alvo e coleta limitados a TEST_MODE.creators.
  let target = options.target || 20;
  let limit = options.limit || target * 2; // SOP 3.3: cerca de 2x o alvo
  if (TEST_MODE.enabled) {
    target = Math.min(target, TEST_MODE.creators);
    limit = Math.min(limit, TEST_MODE.creators);
  }

  const info = {
    round: options.round || null,
    theme,
    red_alert: redAlert,
    window: redAlert ? (options.window || defaultWindow(now)) : options.window || null,
    target,
    limit,
    test_mode: TEST_MODE.enabled,
    criteria: options.criteria || null,
    created_at: now.toISOString(),
  };
  round.writeJson(f.round, info);
  return { dir, info, files: f };
}

// Busca no YouTube, coleta, métricas e regras. Gera candidates.json e review.md.
async function runSearch(dir, onProgress = () => {}) {
  requireKey('YOUTUBE_API_KEY');
  const f = round.files(dir);
  const info = round.readJson(f.round, 'configuração da Round');
  const brief = loadQueries(f.queries);
  const now = new Date();
  const { window } = info;

  // 1. Busca no YouTube, agrupando vídeos por canal
  const byChannel = new Map();
  for (const [i, query] of brief.queries.entries()) {
    onProgress('Buscando no YouTube', `(${i + 1}/${brief.queries.length}) ${query}`);
    const results = await youtube.searchVideos(query, {
      publishedAfter: window ? `${window.from}T00:00:00Z` : undefined,
      publishedBefore: window ? `${window.to}T23:59:59Z` : undefined,
    });
    for (const r of results) {
      if (!byChannel.has(r.channelId)) byChannel.set(r.channelId, []);
      const list = byChannel.get(r.channelId);
      if (!list.some((m) => m.videoId === r.videoId)) list.push({ ...r, query });
    }
  }
  onProgress('Buscando no YouTube', `${byChannel.size} canais encontrados`);

  // 2. Dados dos canais e filtro de tamanho (antes de gastar cota com vídeos)
  const channels = await youtube.getChannels([...byChannel.keys()]);
  const big = channels.filter((c) => c.videoCount > 0 && (c.subscribersHidden || c.subscribers >= MIN_SUBSCRIBERS));
  const smallCount = channels.length - big.length;
  // Prioridade: canais que apareceram em mais buscas; depois, mais inscritos.
  big.sort((a, b) => (byChannel.get(b.channelId).length - byChannel.get(a.channelId).length)
    || ((b.subscribers || 0) - (a.subscribers || 0)));
  const selected = big.slice(0, info.limit);
  onProgress('Buscando no YouTube', `${big.length} com 10K+ inscritos (${smallCount} menores descartados). Coletando ${selected.length}.`);

  // 3. Vídeos e métricas de cada canal
  let done = 0;
  const creators = await mapLimit(selected, PARALLEL_CHANNELS, async (channel) => {
    let collected;
    try {
      collected = await youtube.getChannelVideos(channel);
    } catch (err) {
      if (err.fatal) throw err;
      collected = { longVideos: [], shortVideos: [], lastUpload: null, shortsSource: 'playlist', error: err.reason || 'API error' };
    }
    done += 1;
    onProgress('Calculando métricas', `(${done}/${selected.length}) ${channel.title}`);
    return buildCreator({ round: info.round, channel, collected, matches: byChannel.get(channel.channelId), now });
  });

  // 4. Resumo para o julgamento na sessão
  const review = buildReview(info, brief, creators);
  const meta = {
    ...info,
    searched_at: now.toISOString(),
    niche: brief.niche,
    trigger_content_definition: brief.triggerContent,
    queries: brief.queries,
    channels_found: byChannel.size,
    channels_below_10k: smallCount,
    to_judge: review.toJudge,
    failed_by_rules: review.failed,
    youtube_quota_units: youtube.quota.units,
    youtube_api_calls: youtube.quota.calls,
  };
  round.writeJson(f.candidates, { meta, creators });
  fs.writeFileSync(f.review, review.markdown, 'utf8');
  return { creators, meta, files: f };
}

// Junta regras, judgments.json e messages.json (se existir) e gera o CSV.
function finalizeRound(dir) {
  const f = round.files(dir);
  const { meta, creators } = round.readJson(f.candidates, 'candidatos (rode "search" antes)');
  const judgmentsFile = round.readJson(f.judgments, 'julgamentos escritos na sessão');
  const judgments = judgmentsFile.judgments || judgmentsFile;

  const ctx = { redAlert: meta.red_alert, window: meta.window };
  const { missing, invalid } = applyJudgments(creators, judgments, ctx);
  if (missing.length || invalid.length) {
    const lines = [];
    if (missing.length) {
      lines.push(`Faltam julgamentos para ${missing.length} canal(is):`);
      for (const m of missing) lines.push(`  - ${m.name} (${m.channelId})`);
    }
    for (const inv of invalid) lines.push(`Julgamento inválido para ${inv.name} (${inv.channelId}): ${inv.errors.join('; ')}`);
    throw new Error(lines.join('\n'));
  }

  // Mensagens do Bryce (Fase 6), por channel ID. Só entram em quem está Approved.
  const warnings = [];
  if (fs.existsSync(f.messages)) {
    const data = round.readJson(f.messages, 'mensagens escritas na sessão');
    const messages = data.messages || data;
    for (const c of creators) {
      const m = messages[c.platforms.youtube.channel_id];
      if (!m) continue;
      if (c.status !== 'Approved') {
        warnings.push(`Mensagem ignorada: ${c.name} não está Approved.`);
        continue;
      }
      c.message_type = m.type || null;
      c.message = removeDashes(m.message);
      if (!c.message.includes('calendly.com/bryce-g-mirasafety/30min')) {
        warnings.push(`Mensagem de ${c.name} está sem o link do Calendly.`);
      }
    }
  }

  const sorted = sortCreators(creators);
  const csvPath = saveCsv(dir, sorted);
  const count = (status) => sorted.filter((c) => c.status === status).length;
  return {
    creators: sorted,
    csvPath,
    warnings,
    counts: { approved: count('Approved'), maybe: count('Maybe'), notApproved: count('Not approved') },
  };
}

module.exports = { newRound, runSearch, finalizeRound, extractContact, buildCreator, defaultWindow };
