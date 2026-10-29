// Pré-filtro e critérios de aprovação (SOP seções 4 e 8).
// Regras numéricas ficam no código. Julgamentos (mídia/loja, risco de marca, ligação
// com o tema, conteúdo-gatilho) vêm do judgments.json, escrito pelo Claude na sessão.
// O código sempre tem a palavra final: o julgamento não aprova quem uma regra reprovou.

const { formatCount } = require('./metrics');

const MIN_SUBSCRIBERS = 10000;
const STATUS_ORDER = { Approved: 0, Maybe: 1, 'Not approved': 2 };

// Regras fixas. Devolve { fail: motivo ou null, caps: [motivos que limitam a Maybe], notes: [] }.
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

  // Pontos fracos: no máximo Maybe
  // Pendente (Ian decide): o SOP 8.1 reprova quem não tem contato; aqui limita a Maybe
  // porque a API do YouTube não mostra a seção de links do canal.
  if (!creator.contact.email && !creator.platforms.instagram.url && !creator.platforms.tiktok.url) {
    caps.push('No public email or Instagram/TikTok found, check channel links');
  }
  if (yt.subscribers === null) caps.push('Subscriber count hidden');
  if (creator.mira_mention) caps.push('Mentions MIRA Safety, check if already an affiliate');
  const ratio = creator.metrics.views_to_subs_ratio;
  if (ratio && ratio.label === 'Weak') caps.push('Weak views/subs ratio');
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

// Formato de cada julgamento no judgments.json (chave = channel ID).
const JUDGMENT_FIELDS = {
  channel_type: ['creator', 'media', 'aggregator', 'store'],
  brand_risk: 'boolean',
  competitor_seller: 'boolean',
  refuses_sponsorships: 'boolean',
  host_left: 'boolean',
  theme_link: 'boolean',
  trigger_index: 'integer',
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
    } else if (typeof value !== rule) {
      errors.push(`${field} precisa ser ${rule}`);
    }
  }
  if (typeof j.why === 'string' && !j.why.trim()) errors.push('why está vazio');
  return errors;
}

// Junta regras e julgamento no status final.
function combine(creator, rules, judgment, ctx) {
  const notes = [...rules.notes];

  // Julgamentos que reprovam (SOP 4 e 8.1), aplicados pelo código.
  let fail = null;
  if (judgment.channel_type === 'media' || judgment.channel_type === 'aggregator') fail = 'Media or news aggregator, not a creator';
  else if (judgment.channel_type === 'store') {
    fail = 'Store or brand channel, not a creator';
    notes.push('Possible wholesale lead');
  } else if (judgment.brand_risk) fail = 'Brand risk';
  else if (judgment.competitor_seller) fail = 'Sells competing preparedness products';
  else if (judgment.refuses_sponsorships) fail = 'Publicly refuses sponsorships';
  else if (judgment.host_left) fail = 'Original host left the channel';
  else if (!judgment.theme_link) fail = 'No link to the Round theme';
  else if (judgment.trigger_index < 0 || judgment.trigger_index >= creator.evidence.search_matches.length) {
    fail = 'No trigger content about the theme';
  }

  let trigger = null;
  if (judgment.trigger_index >= 0 && judgment.trigger_index < creator.evidence.search_matches.length) {
    trigger = creator.evidence.search_matches[judgment.trigger_index];
    if (ctx.redAlert && ctx.window && (trigger.date < ctx.window.from || trigger.date > ctx.window.to)) {
      fail = fail || 'Trigger content outside the Red Alert window';
    }
  }

  let status = judgment.status;
  let why = judgment.why;
  if (fail) {
    status = 'Not approved';
    why = judgment.status === 'Not approved' ? judgment.why : fail;
  } else {
    if (rules.caps.length && status === 'Approved') {
      status = 'Maybe';
      why = `${judgment.why}; ${rules.caps.join('; ')}`;
    }
    if (judgment.confidence === 'low' && status === 'Approved') {
      status = 'Maybe';
      why = `${judgment.why} (low confidence)`;
    }
  }

  return { status, why, niche: judgment.niche, trigger, notes };
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
  combine,
  validateJudgment,
  applyJudgments,
  sortCreators,
  removeDashes,
  JUDGMENT_FIELDS,
};
