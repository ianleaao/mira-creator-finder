// Testes das regras de aprovação (sem chamar o Claude).
const test = require('node:test');
const assert = require('node:assert');
const { applyRules, combine, sortCreators, removeDashes, validateJudgment, applyJudgments } = require('../src/classify');

// Creator de exemplo que passa em todas as regras.
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
      recent_titles: ['Bug out bag 2026'],
    },
  };
  return { ...base, ...overrides };
}

const judgment = (overrides = {}) => ({
  channel_type: 'creator', brand_risk: false, competitor_seller: false, refuses_sponsorships: false,
  host_left: false, theme_link: true, niche_fit: 'strong', recurring_theme: true, competitor_partner: false, trigger_index: 0, niche: 'Family prepper',
  status: 'Approved', why: 'Prepper channel with a FORTRESS video', confidence: 'high', ...overrides,
});

const CTX = { theme: 'Pentagon FORTRESS', redAlert: true, window: { from: '2026-09-30', to: '2026-10-28' } };

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
  assert.strictEqual(applyRules(old, { ...CTX, redAlert: false }).fail, null);
});

test('pontos fracos limitam a Maybe', () => {
  const noContact = creator({ contact: { email: null } });
  const rules = applyRules(noContact, CTX);
  assert.strictEqual(rules.fail, null);
  const result = combine(noContact, rules, judgment(), CTX);
  assert.strictEqual(result.status, 'Maybe');
  assert.match(result.why, /No public email/);
});

test('aprovação limpa continua Approved e escolhe o gatilho', () => {
  const c = creator();
  const result = combine(c, applyRules(c, CTX), judgment(), CTX);
  assert.strictEqual(result.status, 'Approved');
  assert.strictEqual(result.trigger.title, 'Pentagon FORTRESS explained');
});

test('o código reprova mídia, loja e risco de marca mesmo se o Claude aprovar', () => {
  const c = creator();
  const rules = applyRules(c, CTX);
  assert.strictEqual(combine(c, rules, judgment({ channel_type: 'media' }), CTX).status, 'Not approved');
  const store = combine(c, rules, judgment({ channel_type: 'store' }), CTX);
  assert.strictEqual(store.status, 'Not approved');
  assert.ok(store.notes.includes('Possible wholesale lead'));
  assert.strictEqual(combine(c, rules, judgment({ brand_risk: true }), CTX).why, 'Brand risk');
  assert.strictEqual(combine(c, rules, judgment({ trigger_index: -1 }), CTX).status, 'Not approved');
  assert.strictEqual(combine(c, rules, judgment({ trigger_index: 7 }), CTX).status, 'Not approved');
});

test('confiança baixa vira Maybe', () => {
  const c = creator();
  assert.strictEqual(combine(c, applyRules(c, CTX), judgment({ confidence: 'low' }), CTX).status, 'Maybe');
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

test('validateJudgment aponta campos errados', () => {
  assert.deepStrictEqual(validateJudgment(judgment()), []);
  const errors = validateJudgment(judgment({ status: 'Aprovado', trigger_index: '0', brand_risk: 'no' }));
  assert.strictEqual(errors.length, 3);
  assert.ok(validateJudgment(judgment({ why: '  ' })).includes('why está vazio'));
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
  assert.strictEqual(ok.trigger_content.title, 'Pentagon FORTRESS explained');
  assert.strictEqual(small.status, 'Not approved');
  assert.match(small.why, /Too small/);
});

// Regras de nicho (correção dos filtros do Ian). Round regular, data de referência fixa.
const REG = { theme: 'WILDFIRE SMOKE', redAlert: false, window: null, now: '2026-11-03T12:00:00Z' };

test('niche_fit "none" e competitor_partner reprovam mesmo com theme_link', () => {
  const c = creator();
  const rules = applyRules(c, REG);
  assert.strictEqual(combine(c, rules, judgment({ niche_fit: 'none' }), REG).status, 'Not approved');
  const comp = combine(c, rules, judgment({ competitor_partner: true }), REG);
  assert.strictEqual(comp.status, 'Not approved');
  assert.strictEqual(comp.why, 'Promotes a competitor brand');
});

test('Approved exige nicho forte, gatilho recente e ratio Good ou Acceptable', () => {
  const c = creator();
  assert.strictEqual(combine(c, applyRules(c, REG), judgment(), REG).status, 'Approved');
});

test('um ponto fraco limita a Maybe', () => {
  const c = creator();
  const partial = combine(c, applyRules(c, REG), judgment({ niche_fit: 'partial' }), REG);
  assert.strictEqual(partial.status, 'Maybe');
  assert.match(partial.why, /partial niche fit/);

  const old = creator();
  old.evidence.search_matches[0].date = '2024-11-18';
  assert.strictEqual(combine(old, applyRules(old, REG), judgment(), REG).status, 'Maybe');

  const weakRatio = creator({ metrics: { views_to_subs_ratio: { ratio: 0.018, label: 'Weak' }, activity: 'Active', days_since_upload: 1 } });
  assert.strictEqual(combine(weakRatio, applyRules(weakRatio, REG), judgment(), REG).status, 'Maybe');
});

test('dois pontos fracos juntos reprovam', () => {
  const c = creator({ metrics: { views_to_subs_ratio: { ratio: 0.018, label: 'Weak' }, activity: 'Active', days_since_upload: 1 } });
  c.evidence.search_matches[0].date = '2024-11-18';
  const r = combine(c, applyRules(c, REG), judgment(), REG);
  assert.strictEqual(r.status, 'Not approved');
  assert.match(r.why, /Two or more weak points: trigger video older than 12 months, weak views\/subs ratio/);
});

test('julgamento sem os campos novos é recusado', () => {
  const j = judgment();
  delete j.niche_fit;
  assert.ok(validateJudgment(j).some((e) => e.startsWith('niche_fit')));
});
