// Testes das regras de aprovação (sem chamar APIs). Regras: CLAUDE.md, Fase 2, item 4.
const test = require('node:test');
const assert = require('node:assert');
const { applyRules, combine, sortCreators, removeDashes, validateJudgment, applyJudgments } = require('../src/classify');

const NOW = '2026-11-03T12:00:00Z';
const PREP_TITLES = [
  'Bug Out Bag 2026 Full Loadout', 'Wildfire Smoke Protection for Your Family', 'Power Outage Prep Checklist',
  'Emergency Water Storage Basics', 'Prepping on a Budget', 'Gas Mask Basics for Beginners',
  'Get Home Bag Update', 'Grid Down Lighting Options', 'Evacuation Plan for Fire Season',
];

// Creator de exemplo que passa em todas as regras: prepper, 9/15 títulos de preparação.
function creator(overrides = {}) {
  const base = {
    name: 'Prepper Dawg',
    status: '',
    why: '',
    niche: '',
    notes: [],
    mira_mention: false,
    platforms: {
      youtube: { subscribers: 50000, avg_video_views: 6000, avg_shorts_views: null, last_upload: '2026-10-20T00:00:00Z' },
      instagram: { url: null },
      tiktok: { url: null },
    },
    metrics: { views_to_subs_ratio: { ratio: 0.12, label: 'Good' }, activity: 'Active', days_since_upload: 8 },
    contact: { email: 'hi@dawg.com' },
    evidence: {
      channel_description: 'Prepping for families',
      search_matches: [{ title: 'Pentagon FORTRESS explained', url: 'https://www.youtube.com/watch?v=a', date: '2026-10-15' }],
      recent_titles: PREP_TITLES.slice(0, 5),
      last_titles: [...PREP_TITLES, 'Channel update', 'Q and A live', 'Thanks for 50K', 'Shop tour', 'Behind the scenes', 'Road trip'],
    },
  };
  return { ...base, ...overrides };
}

const judgment = (overrides = {}) => ({
  channel_type: 'creator', niche_fit: 'strong', niche_evidence: ['Bug Out Bag 2026 Full Loadout', 'Power Outage Prep Checklist'],
  recurring_theme: true, theme_link: true, trigger_index: 0, competitor_partner: '',
  brand_risk: false, competitor_seller: false, refuses_sponsorships: false, host_left: false,
  niche: 'Family prepper', status: 'Approved', why: 'Prepper channel with a FORTRESS video', confidence: 'high', ...overrides,
});

const CTX = { theme: 'Pentagon FORTRESS', redAlert: true, window: { from: '2026-09-30', to: '2026-10-28' }, now: NOW };
const REG = { redAlert: false, window: null, triggerMaxAgeMonths: 12, allowedNiches: [], nicheKeywords: [], now: NOW };

const run = (c, j, ctx = REG) => combine(c, applyRules(c, ctx), j, ctx);

test('regras reprovam pequeno, inativo e sem views', () => {
  const small = creator();
  small.platforms.youtube.subscribers = 5800;
  assert.strictEqual(applyRules(small, CTX).fail, 'Too small (5.8K subscribers)');
  const inactive = creator({ metrics: { activity: 'Inactive', views_to_subs_ratio: null } });
  assert.match(applyRules(inactive, CTX).fail, /^Inactive, last upload 2026-10-20/);
  const noViews = creator();
  noViews.platforms.youtube.avg_video_views = null;
  assert.strictEqual(applyRules(noViews, CTX).fail, 'Could not verify views');
});

test('Red Alert reprova gatilho fora da janela', () => {
  const old = creator();
  old.evidence.search_matches[0].date = '2026-08-01';
  assert.strictEqual(applyRules(old, CTX).fail, 'Trigger content outside the Red Alert window');
  assert.strictEqual(applyRules(old, REG).fail, null);
});

test('aprovação limpa continua Approved e escolhe o gatilho', () => {
  const result = run(creator(), judgment(), CTX);
  assert.strictEqual(result.status, 'Approved');
  assert.strictEqual(result.trigger.title, 'Pentagon FORTRESS explained');
});

test('o código reprova mídia, loja e risco de marca mesmo se o julgamento aprovar', () => {
  assert.strictEqual(run(creator(), judgment({ channel_type: 'media' })).status, 'Not approved');
  const store = run(creator(), judgment({ channel_type: 'store' }));
  assert.strictEqual(store.status, 'Not approved');
  assert.ok(store.notes.includes('Possible wholesale lead'));
  assert.strictEqual(run(creator(), judgment({ brand_risk: true })).why, 'Brand risk');
  assert.strictEqual(run(creator(), judgment({ trigger_index: -1 })).why, 'No trigger video about the Round theme');
  assert.strictEqual(run(creator(), judgment({ trigger_index: 7 })).status, 'Not approved');
});

test('sem contato é ponto fraco: no máximo Maybe', () => {
  const r = run(creator({ contact: { email: null } }), judgment());
  assert.strictEqual(r.status, 'Maybe');
  assert.match(r.why, /no public email/);
});

test('confiança baixa é ponto fraco', () => {
  assert.strictEqual(run(creator(), judgment({ confidence: 'low' })).status, 'Maybe');
});

test('atividade Attention e mais de 600K são pontos fracos; dois juntos reprovam', () => {
  const attention = creator({ metrics: { views_to_subs_ratio: { ratio: 0.12, label: 'Good' }, activity: 'Attention', days_since_upload: 45 } });
  assert.strictEqual(run(attention, judgment()).status, 'Maybe');
  attention.platforms.youtube.subscribers = 900000;
  const r = run(attention, judgment());
  assert.strictEqual(r.status, 'Not approved');
  assert.match(r.why, /Two or more weak points: activity Attention, over 600K subscribers/);
});

test('validateJudgment aponta campos errados e exige niche_evidence e competitor_partner', () => {
  assert.deepStrictEqual(validateJudgment(judgment()), []);
  const errors = validateJudgment(judgment({ status: 'Aprovado', trigger_index: '0', brand_risk: 'no' }));
  assert.strictEqual(errors.length, 3);
  assert.ok(validateJudgment(judgment({ why: '  ' })).includes('why está vazio'));
  assert.ok(validateJudgment(judgment({ niche_evidence: 'x' })).some((e) => e.startsWith('niche_evidence')));
  assert.ok(validateJudgment(judgment({ competitor_partner: false })).some((e) => e.startsWith('competitor_partner')));
  assert.deepStrictEqual(validateJudgment(null), ['não é um objeto']);
});

test('applyJudgments lista canais sem julgamento e ignora reprovados por regra', () => {
  const ok = creator();
  ok.platforms.youtube.channel_id = 'UCok';
  const small = creator();
  small.platforms = { ...small.platforms, youtube: { ...small.platforms.youtube, channel_id: 'UCsmall', subscribers: 3000 } };
  const missing = creator();
  missing.platforms.youtube.channel_id = 'UCmissing';

  const result = applyJudgments([ok, small, missing], { UCok: judgment() }, CTX);
  assert.deepStrictEqual(result.missing.map((m) => m.channelId), ['UCmissing']);
  assert.strictEqual(ok.status, 'Approved');
  assert.strictEqual(ok.niche_score, '9/15');
  assert.strictEqual(small.status, 'Not approved');
  assert.match(small.why, /Too small/);
});

test('ordenação: Approved, Maybe, Not approved', () => {
  const list = [
    creator({ name: 'C', status: 'Not approved' }),
    creator({ name: 'B', status: 'Maybe' }),
    creator({ name: 'A', status: 'Approved' }),
  ];
  assert.deepStrictEqual(sortCreators(list).map((c) => c.name), ['A', 'B', 'C']);
});

test('removeDashes troca travessão por vírgula e mantém hífen', () => {
  const emDash = String.fromCharCode(0x2014);
  assert.strictEqual(removeDashes(`Strong fit ${emDash} great trigger`), 'Strong fit, great trigger');
  assert.strictEqual(removeDashes('off-grid prepper'), 'off-grid prepper');
});

