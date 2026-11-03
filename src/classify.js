// Pré-filtro e critérios de aprovação (SOP seções 4 e 8).
// Regras numéricas ficam no código. Julgamentos (mídia/loja, risco de marca, ligação
// com o tema, conteúdo-gatilho) vêm do judgments.json, escrito pelo Claude na sessão.
// O código sempre tem a palavra final: o julgamento não aprova quem uma regra reprovou.

const { formatCount, formatRatio, monthsSince } = require('./metrics');
const { nicheScore, isCoreChannel } = require('./niche');

const MIN_SUBSCRIBERS = 10000;
const LARGE_SUBSCRIBERS = 600000; // SOP 6.6
const STATUS_ORDER = { Approved: 0, Maybe: 1, 'Not approved': 2 };

// Regras fixas, antes do julgamento. Devolve { fail: motivo ou null, caps: [tetos em Maybe], notes: [] }.
function applyRules(creator, { redAlert = false, window = null } = {}) {
  const yt = creator.platforms.youtube;
  const caps = [];
  const notes = [];

  // Reprovação automática (SOP 8.1)
  if (yt.subscribers !== null && yt.subscribers < MIN_SUBSCRIBERS) {
    return { fail: `Too small (${formatCount(yt.subscribers)} subscribers)`, caps, notes };
  }
  if (creator.metrics.activity === 'Inactive') {
    return { fail: `Inactive, last upload ${String(yt.last_upload).slice(0, 10)}`, caps, notes };
  }
  if (creator.metrics.activity === 'Not verified') {
    return { fail: 'Could not verify recent uploads', caps, notes };
  }
  if (yt.avg_video_views === null && yt.avg_shorts_views === null) {
    return { fail: 'Could not verify views', caps, notes };
  }
  if (!creator.evidence.search_matches.length) {
    return { fail: 'No trigger content found', caps, notes };
  }

  // Tetos em Maybe que não contam como ponto fraco.
  if (yt.subscribers === null) caps.push('Subscriber count hidden');
  if (creator.mira_mention) caps.push('Mentions MIRA Safety, check if already an affiliate');
  if (creator.metrics.activity === 'Attention') {
    notes.push(`Last upload ${creator.metrics.days_since_upload} days ago`);
  }

  // Red Alert: a janela precisa ter pelo menos um vídeo-gatilho
  if (redAlert && window) {
    const inWindow = creator.evidence.search_matches.some((m) => m.date >= window.from && m.date <= window.to);
    if (!inWindow) return { fail: 'Trigger content outside the Red Alert window', caps, notes };
  }

  return { fail: null, caps, notes };
}

function hasContact(creator) {
  return Boolean(creator.contact.email || creator.platforms.instagram.url || creator.platforms.tiktok.url);
}

// Pontos fracos que não dependem do julgamento (CLAUDE.md, Fase 2, item 4).
function objectiveWeakPoints(creator) {
  const weak = [];
  if (creator.metrics.activity === 'Attention') weak.push('activity Attention');
  if (!hasContact(creator)) weak.push('no public email or Instagram/TikTok');
  const subs = creator.platforms.youtube.subscribers;
  if (subs !== null && subs > LARGE_SUBSCRIBERS) weak.push('over 600K subscribers');
  return weak;
}

// Formato de cada julgamento no judgments.json (chave = channel ID).
const JUDGMENT_FIELDS = {
  channel_type: ['creator', 'media', 'aggregator', 'store'],
  niche_fit: ['strong', 'partial', 'none'],  // só títulos de PREPARAÇÃO contam
  niche_evidence: 'string[]',                // títulos que provam o nicho (copiados do review.md)
  recurring_theme: 'boolean',                // mais de 1 vídeo no tema ou em tema próximo
  theme_link: 'boolean',
  trigger_index: 'integer',
  competitor_partner: 'string',              // marca concorrente divulgada, ou vazio
  brand_risk: 'boolean',
  competitor_seller: 'boolean',
  refuses_sponsorships: 'boolean',
  host_left: 'boolean',
  niche: 'string',
  status: ['Approved', 'Maybe', 'Not approved'],
  why: 'string',
  confidence: ['high', 'medium', 'low'],
};

// Devolve a lista de problemas de um julgamento (vazia se estiver ok).
function validateJudgment(j) {
  if (!j || typeof j !== 'object') return ['não é um objeto'];
  const errors = [];
  for (const [field, rule] of Object.entries(JUDGMENT_FIELDS)) {
    const value = j[field];
    if (Array.isArray(rule)) {
      if (!rule.includes(value)) errors.push(`${field} precisa ser um de: ${rule.join(', ')}`);
    } else if (rule === 'integer') {
      if (!Number.isInteger(value)) errors.push(`${field} precisa ser um número inteiro`);
    } else if (rule === 'string[]') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) errors.push(`${field} precisa ser uma lista de textos`);
    } else if (typeof value !== rule) {
      errors.push(`${field} precisa ser ${rule}`);
    }
  }
  if (typeof j.why === 'string' && !j.why.trim()) errors.push('why está vazio');
  return errors;
}

// Títulos conhecidos do canal (para conferir o niche_evidence).
function knownTitles(creator) {
  const ev = creator.evidence;
  return new Set([
    ...(ev.last_titles || []),
    ...(ev.recent_titles || []),
    ...ev.search_matches.map((m) => m.title),
  ].map((t) => String(t).trim()));
}

// Confere o niche_fit do julgamento com os dados (o código decide):
//  - niche_evidence obrigatório para strong e partial, com títulos que existem no candidates.json;
//    título inventado ou sem evidência: none;
//  - canal adjacente (fora do nicho central e dos nichos liberados na Round):
//    menos de 5/15 títulos de preparação vira none; 5 a 7 vira no máximo partial.
function verifyNicheFit(creator, judgment, ctx = {}) {
  const notes = [];
  let fit = judgment.niche_fit;
  const ev = creator.evidence;

  if (fit === 'strong' || fit === 'partial') {
    const known = knownTitles(creator);
    const evidence = judgment.niche_evidence || [];
    const invented = evidence.filter((t) => !known.has(String(t).trim()));
    if (!evidence.length || invented.length) {
      notes.push(evidence.length ? 'niche_evidence has titles not found in the collected data' : 'niche_evidence missing');
      fit = 'none';
    }
  }

  const titles = (ev.last_titles && ev.last_titles.length) ? ev.last_titles : ev.recent_titles;
  const score = nicheScore(titles, ev.channel_description, ctx.nicheKeywords || []);
  const core = isCoreChannel({ name: creator.name, description: ev.channel_description }, ctx.allowedNiches || []);
  if (!core && fit !== 'none') {
    if (score.count < 5) {
      notes.push(`Adjacent niche with only ${score.label} preparedness titles`);
      fit = 'none';
    } else if (score.count < 8 && fit === 'strong') {
      notes.push(`Adjacent niche with ${score.label} preparedness titles: partial fit`);
      fit = 'partial';
    }
  }
  return { fit, score, core, notes };
}

// Junta regras e julgamento no status final (CLAUDE.md, Fase 2, item 4), nesta ordem:
//  1. niche_fit none: Not approved ("Outside MIRA niche").
//  2. trigger_index -1 ou gatilho mais velho que trigger_max_age_months: Not approved.
//  3. channel_type diferente de creator, brand_risk, competitor_seller, refuses_sponsorships, host_left: Not approved.
//  4. Ratio Weak: Not approved, exceto niche_fit strong E recurring_theme (aí conta como ponto fraco).
//  5. competitor_partner preenchido: no máximo Maybe, com a marca em Notes.
//  6. Pontos fracos (partial, ratio Weak, Attention, sem contato, confiança low, mais de 600K):
//     um limita a Maybe; dois ou mais reprovam.
//  7. Approved só com niche_fit strong + theme_link + gatilho válido + ratio Good ou Acceptable
//     + atividade Active + contato.
function combine(creator, rules, judgment, ctx = {}) {
  const notes = [...rules.notes];
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const maxAge = ctx.triggerMaxAgeMonths || 12;
  const niche = verifyNicheFit(creator, judgment, ctx);
  notes.push(...niche.notes);

  let trigger = null;
  if (judgment.trigger_index >= 0 && judgment.trigger_index < creator.evidence.search_matches.length) {
    trigger = creator.evidence.search_matches[judgment.trigger_index];
  }
  const triggerAge = trigger ? monthsSince(trigger.date, now) : null;
  const ratio = creator.metrics.views_to_subs_ratio;
  const ratioWeak = Boolean(ratio && ratio.label === 'Weak');

  let fail = null;
  if (niche.fit === 'none') fail = 'Outside MIRA niche';
  else if (!trigger) fail = 'No trigger video about the Round theme';
  else if (ctx.redAlert && ctx.window && (trigger.date < ctx.window.from || trigger.date > ctx.window.to)) {
    fail = 'Trigger content outside the Red Alert window';
  } else if (!ctx.redAlert && triggerAge > maxAge) fail = `Trigger video older than ${maxAge} months (${triggerAge} months)`;
  else if (judgment.channel_type === 'media' || judgment.channel_type === 'aggregator') fail = 'Media or news aggregator, not a creator';
  else if (judgment.channel_type === 'store') {
    fail = 'Store or brand channel, not a creator';
    notes.push('Possible wholesale lead');
  } else if (judgment.brand_risk) fail = 'Brand risk';
  else if (judgment.competitor_seller) fail = 'Sells competing preparedness products';
  else if (judgment.refuses_sponsorships) fail = 'Publicly refuses sponsorships';
  else if (judgment.host_left) fail = 'Original host left the channel';
  else if (!judgment.theme_link) fail = 'No link to the Round theme';
  else if (ratioWeak && !(niche.fit === 'strong' && judgment.recurring_theme)) {
    fail = `Weak views/subs ratio (${formatRatio(ratio)})`;
  }

  // Marca concorrente: anotada sempre; limita a Maybe.
  const competitor = String(judgment.competitor_partner || '').trim();
  if (competitor) notes.push(`Promotes competitor brand: ${competitor}`);

  // Pontos fracos contados.
  const weak = [];
  if (niche.fit === 'partial') weak.push('partial niche fit');
  if (ratioWeak) weak.push('weak views/subs ratio');
  weak.push(...objectiveWeakPoints(creator));
  if (judgment.confidence === 'low') weak.push('low confidence');
  if (!fail && weak.length >= 2) fail = `Two or more weak points: ${weak.join(', ')}`;

  // Tetos em Maybe.
  const caps = [...weak, ...rules.caps];
  if (competitor) caps.push(`promotes competitor brand (${competitor})`);
  if (!ratio) caps.push('views/subs ratio not verified');

  let status = judgment.status;
  let why = judgment.why;
  if (fail) {
    status = 'Not approved';
    why = judgment.status === 'Not approved' ? judgment.why : fail;
  } else if (caps.length && status === 'Approved') {
    status = 'Maybe';
    why = `${judgment.why}; ${caps.join('; ')}`;
  }

  return { status, why, niche: judgment.niche, trigger, notes, nicheFit: niche.fit, nicheScore: niche.score };
}

function removeDashes(text) {
  // 0x2014 = travessão, 0x2013 = meio-travessão. Montados por código para o caractere não aparecer no arquivo.
  const dashes = new RegExp('\\s*[' + String.fromCharCode(0x2014, 0x2013) + ']\\s*', 'g');
  return String(text || '').replace(dashes, ', ');
}

// Aplica regras e julgamentos a todos os creators.
// judgments: { [channelId]: julgamento }. Devolve { creators, missing, invalid }.
// missing: canais que precisavam de julgamento e não têm. invalid: [{ channelId, name, errors }].
function applyJudgments(creators, judgments, ctx) {
  const missing = [];
  const invalid = [];

  for (const creator of creators) {
    const id = creator.platforms.youtube.channel_id;
    const rules = applyRules(creator, ctx);

    if (rules.fail) {
      Object.assign(creator, { status: 'Not approved', why: rules.fail, confidence: 'high' });
      continue;
    }
    const judgment = judgments[id];
    if (!judgment) {
      missing.push({ channelId: id, name: creator.name });
      continue;
    }
    const errors = validateJudgment(judgment);
    if (errors.length) {
      invalid.push({ channelId: id, name: creator.name, errors });
      continue;
    }

    const result = combine(creator, rules, judgment, ctx);
    creator.status = result.status;
    creator.why = removeDashes(result.why);
    creator.niche = removeDashes(result.niche);
    creator.confidence = judgment.confidence;
    creator.notes.push(...result.notes);
    creator.niche_fit = result.nicheFit;
    creator.niche_score = result.nicheScore ? result.nicheScore.label : null;
    creator.trigger_content = result.trigger
      ? { title: result.trigger.title, url: result.trigger.url, date: result.trigger.date }
      : null;
  }

  return { creators, missing, invalid };
}

// Approved, depois Maybe, depois Not approved. Dentro do grupo, mais views primeiro.
function sortCreators(creators) {
  return [...creators].sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    || ((b.platforms.youtube.avg_video_views || 0) - (a.platforms.youtube.avg_video_views || 0)));
}

module.exports = {
  applyRules,
  objectiveWeakPoints,
  verifyNicheFit,
  hasContact,
  combine,
  validateJudgment,
  applyJudgments,
  sortCreators,
  removeDashes,
  JUDGMENT_FIELDS,
};
