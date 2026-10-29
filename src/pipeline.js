// Orquestra as etapas de uma Round (só a parte determinística).
//   new       cria a pasta da Round e o round.json
//   search    roda as buscas do queries.json em etapas: pré-filtro, coleta, métricas e regras.
//             Para quando há candidatos suficientes para julgar; rodar de novo continua de onde parou.
//   finalize  junta regras + judgments.json (+ messages.json), gera o CSV e atualiza a planilha do tema
// O julgamento (buscas, status, motivo, mensagens) é feito pelo Claude na sessão.

const fs = require('fs');
const path = require('path');
const { loadQueries } = require('./brief');
const youtube = require('./youtube');
const metrics = require('./metrics');
const { requireKey, hasFile, TEST_MODE } = require('./config');
const { publishRound, themeSheetKeys } = require('./sources/drive');
const { applyRules, applyJudgments, sortCreators, removeDashes } = require('./classify');
const { prefilter } = require('./prefilter');
const { isInSheet } = require('./sheet-merge');
const { buildReview } = require('./review');
const { saveCsv } = require('./output');
const round = require('./round');

const MIN_SUBSCRIBERS = 10000;     // SOP 6.6 / 8.1: abaixo de 10K reprova
const LARGE_SUBSCRIBERS = 600000;  // SOP 6.6: acima disso, anotar "large, may be expensive"

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const MIRA_RE = /mira\s?safety|mirasafety\.com/i;

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

  // Alvo = creators VÁLIDOS (Approved ou Maybe). No modo de teste, TEST_MODE.validCreators.
  const target = TEST_MODE.enabled ? TEST_MODE.validCreators : (options.target || 20);

  const info = {
    round: options.round || null,
    theme,
    red_alert: redAlert,
    window: redAlert ? (options.window || defaultWindow(now)) : options.window || null,
    target,
    test_mode: TEST_MODE.enabled,
    criteria: options.criteria || null,
    created_at: now.toISOString(),
  };
  round.writeJson(f.round, info);
  return { dir, info, files: f };
}

function readJudgments(file) {
  if (!fs.existsSync(file)) return {};
  const data = round.readJson(file, 'julgamentos escritos na sessão');
  return data.judgments || data;
}

// Quantos creators já julgados são válidos (Approved ou Maybe), aplicando regras + julgamento.
function countValid(creators, judgments, ctx) {
  const judged = creators
    .filter((c) => judgments[c.platforms.youtube.channel_id])
    .map((c) => JSON.parse(JSON.stringify(c)));
  applyJudgments(judged, judgments, ctx);
  return judged.filter((c) => c.status === 'Approved' || c.status === 'Maybe').length;
}

// Estado salvo no candidates.json entre execuções do search.
function loadState(f, info, brief) {
  const empty = {
    meta: { ...info },
    creators: [],
    prefiltered: [],  // descartados no pré-filtro (marca, loja, mídia, governo)
    small: [],        // abaixo de 10K inscritos ou sem vídeos
    excluded: [],     // já estão na planilha do tema
    queue: [],        // canais aprovados no pré-filtro, ainda não coletados
    queries_done: [],
  };
  if (!fs.existsSync(f.candidates)) return empty;
  const state = round.readJson(f.candidates, 'candidatos');
  if (!Array.isArray(state.queries_done)) return empty; // formato antigo: recomeça
  return { ...empty, ...state, meta: { ...state.meta, ...info } };
}

function seenIds(state) {
  return new Set([
    ...state.creators.map((c) => c.platforms.youtube.channel_id),
    ...state.prefiltered.map((x) => x.channel_id),
    ...state.small.map((x) => x.channel_id),
    ...state.excluded.map((x) => x.channel_id),
    ...state.queue.map((x) => x.channel.channelId),
  ]);
}

// Ordem da fila de coleta (SOP 6.6): primeiro a faixa preferida (10K a 600K inscritos),
// depois quem apareceu em mais vídeos da busca. Canais gigantes vão para o fim
// (podem ser aprovados, mas são caros e raramente são creators do nicho).
function sortQueue(queue) {
  const inBand = (ch) => ch.subscribersHidden || ch.subscribers <= LARGE_SUBSCRIBERS;
  queue.sort((a, b) => {
    const bandA = inBand(a.channel);
    const bandB = inBand(b.channel);
    if (bandA !== bandB) return bandA ? -1 : 1;
    // Fora da faixa: o menor primeiro.
    if (!bandA) return (a.channel.subscribers || 0) - (b.channel.subscribers || 0);
    // Na faixa: mais vídeos na busca; depois, mais inscritos.
    return (b.matches.length - a.matches.length) || ((b.channel.subscribers || 0) - (a.channel.subscribers || 0));
  });
  return queue;
}

// Creator "provisório" só para comparar com a planilha do tema.
function asSheetCreator(channel) {
  return {
    name: channel.title,
    platforms: { youtube: { channel_id: channel.channelId, handle: channel.handle, url: channelUrl(channel) } },
  };
}

// Busca no YouTube em etapas. Para quando há candidatos suficientes para julgar,
// quando as buscas acabam ou quando o alarme de cota dispara (o progresso fica salvo).
async function runSearch(dir, onProgress = () => {}, options = {}) {
  requireKey('YOUTUBE_API_KEY');
  if (options.allowQuota) youtube.setQuotaGuard(options.allowQuota);
  const f = round.files(dir);
  const info = round.readJson(f.round, 'configuração da Round');
  const brief = loadQueries(f.queries);
  const now = new Date();
  const ctx = { redAlert: info.red_alert, window: info.window };
  const state = loadState(f, info, brief);
  Object.assign(state.meta, { niche: brief.niche, trigger_content_definition: brief.triggerContent, queries: brief.queries });

  // Quem já está na planilha do tema não entra de novo (lista de exclusão).
  // options.sheetKeys: lista de exclusão pronta (usado nos testes, sem consultar o Google).
  let sheetKeys = new Set();
  if (options.sheetKeys) {
    sheetKeys = options.sheetKeys;
  } else if (hasFile('google-oauth-client.json') && hasFile('token.json')) {
    const sheet = await themeSheetKeys(info.theme);
    sheetKeys = sheet.keys;
    onProgress('Preparando', `Planilha do tema: ${sheet.count} creator(s) já registrados (excluídos da busca)`);
  } else {
    onProgress('Preparando', 'Sem login no Google: planilha do tema não consultada');
  }

  const judgments = readJudgments(f.judgments);
  const valid = countValid(state.creators, judgments, ctx);
  const pending = () => state.creators.filter((c) => !judgments[c.platforms.youtube.channel_id] && !applyRules(c, ctx).fail).length;
  const need = Math.max(info.target - valid, 0);
  // Meta da etapa: o dobro do que falta, para ter folga no julgamento.
  const goal = need * 2;
  onProgress('Preparando', `Válidos: ${valid} de ${info.target}. Aguardando julgamento: ${pending()}. Meta desta etapa: ${goal} para julgar.`);

  const save = () => round.writeJson(f.candidates, state);
  const runStats = { prefiltered: 0, small: 0, excluded: 0, collected: 0 };

  // Coleta os canais da fila até atingir a meta da etapa.
  async function drainQueue() {
    while (state.queue.length && pending() < goal) {
      const { channel, matches } = state.queue.shift();
      let collected;
      try {
        collected = await youtube.getChannelVideos(channel);
      } catch (err) {
        if (err.fatal) {
          state.queue.unshift({ channel, matches });
          save();
          throw err;
        }
        collected = { longVideos: [], shortVideos: [], lastUpload: null, shortsSource: 'playlist', error: err.reason || 'API error' };
      }
      const creator = buildCreator({ round: info.round, channel, collected, matches, now });
      state.creators.push(creator);
      runStats.collected += 1;
      const rules = applyRules(creator, ctx);
      onProgress('Coletando canais', `${channel.title}: ${rules.fail ? `reprovado por regra (${rules.fail})` : 'para julgar'}`);
      save();
    }
  }

  try {
    // Cada etapa roda pelo menos uma busca nova antes de consumir a fila, para que as buscas
    // mais focadas no assunto entrem na disputa e quem aparece em várias buscas suba na fila.
    for (const query of brief.queries) {
      if (need === 0 || pending() >= goal) break;
      if (state.queries_done.includes(query)) continue;

      onProgress('Buscando no YouTube', `"${query}"`);
      const results = await youtube.searchVideos(query, {
        publishedAfter: info.window ? `${info.window.from}T00:00:00Z` : undefined,
        publishedBefore: info.window ? `${info.window.to}T23:59:59Z` : undefined,
      });

      // Vídeos agrupados por canal. Canais já coletados ganham os vídeos novos como evidência.
      const byChannel = new Map();
      for (const r of results) {
        if (!byChannel.has(r.channelId)) byChannel.set(r.channelId, []);
        byChannel.get(r.channelId).push({ ...r, query });
      }
      for (const c of state.creators) {
        for (const m of byChannel.get(c.platforms.youtube.channel_id) || []) {
          const url = `https://www.youtube.com/watch?v=${m.videoId}`;
          if (!c.evidence.search_matches.some((x) => x.url === url)) {
            c.evidence.search_matches.push({ title: m.title, url, date: m.publishedAt.slice(0, 10), query });
          }
        }
      }
      // Canais ainda na fila também ganham os vídeos novos (sobem na prioridade).
      for (const item of state.queue) {
        for (const m of byChannel.get(item.channel.channelId) || []) {
          if (!item.matches.some((x) => x.videoId === m.videoId)) item.matches.push(m);
        }
      }

      const seen = seenIds(state);
      const newIds = [...byChannel.keys()].filter((id) => !seen.has(id));
      const channels = newIds.length ? await youtube.getChannels(newIds) : [];
      const survivors = [];
      for (const ch of channels) {
        const entry = { channel_id: ch.channelId, name: ch.title };
        if (isInSheet(asSheetCreator(ch), sheetKeys)) {
          state.excluded.push(entry);
          runStats.excluded += 1;
          continue;
        }
        if (ch.videoCount === 0 || (!ch.subscribersHidden && ch.subscribers < MIN_SUBSCRIBERS)) {
          state.small.push({ ...entry, subscribers: ch.subscribers });
          runStats.small += 1;
          continue;
        }
        const reason = prefilter(ch);
        if (reason) {
          state.prefiltered.push({ ...entry, reason });
          runStats.prefiltered += 1;
          onProgress('Pré-filtro', `${ch.title}: ${reason.replace('Pre-filter: ', '')}`);
          continue;
        }
        survivors.push({ channel: ch, matches: byChannel.get(ch.channelId) });
      }
      state.queue.push(...survivors);
      sortQueue(state.queue);
      state.queries_done.push(query);
      save();
      await drainQueue();
    }
    // Buscas acabaram: consome o que sobrou na fila.
    if (need > 0) await drainQueue();
  } finally {
    // Atualiza o resumo para o julgamento, mesmo se o alarme de cota parar no meio.
    const judgedIds = new Set(Object.keys(judgments));
    const review = buildReview(info, brief, state.creators, { skipIds: judgedIds, prefiltered: state.prefiltered });
    state.meta = {
      ...state.meta,
      searched_at: now.toISOString(),
      to_judge: review.toJudge,
      youtube_quota_units_total: (state.meta.youtube_quota_units_total || 0) + youtube.quota.units,
    };
    save();
    fs.writeFileSync(f.review, review.markdown, 'utf8');
  }

  const remainingQueries = brief.queries.filter((q) => !state.queries_done.includes(q)).length;
  return {
    meta: state.meta,
    files: f,
    stats: {
      ...runStats,
      valid,
      need,
      toJudge: pending(),
      remainingQueries,
      queue: state.queue.length,
      unitsThisRun: youtube.quota.units,
      unitsToday: youtube.usedToday(),
    },
  };
}

// Junta regras, judgments.json e messages.json (se existir), gera o CSV e,
// se o login no Google estiver feito, atualiza a planilha do tema no Drive (Fase 5).
// options.sheet = false pula a planilha (usado nos testes).
async function finalizeRound(dir, options = {}) {
  const f = round.files(dir);
  const state = round.readJson(f.candidates, 'candidatos (rode "search" antes)');
  const { meta, creators } = state;
  const judgments = readJudgments(f.judgments);
  if (!fs.existsSync(f.judgments)) throw new Error(`Arquivo não encontrado: ${f.judgments} (julgamentos escritos na sessão).`);

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

  let sheet = null;
  if (options.sheet !== false) {
    if (hasFile('google-oauth-client.json') && hasFile('token.json')) {
      sheet = await publishRound({ theme: meta.theme, round: meta.round, creators: sorted });
    } else {
      warnings.push('Planilha no Drive não atualizada: falta o login no Google (veja o README, Login no Google). O CSV foi gerado.');
    }
  }

  const count = (status) => sorted.filter((c) => c.status === status).length;
  const valid = count('Approved') + count('Maybe');
  const queriesLeft = (meta.queries || []).filter((q) => !(state.queries_done || []).includes(q)).length;
  if (valid < meta.target && (queriesLeft || (state.queue || []).length)) {
    warnings.push(`Só ${valid} de ${meta.target} válidos. Ainda há buscas ou canais na fila: rode "search" de novo.`);
  }
  return {
    creators: sorted,
    csvPath,
    sheet,
    warnings,
    prefiltered: state.prefiltered || [],
    counts: { approved: count('Approved'), maybe: count('Maybe'), notApproved: count('Not approved'), valid, target: meta.target },
  };
}

module.exports = { newRound, runSearch, finalizeRound, extractContact, buildCreator, defaultWindow, countValid, sortQueue };
