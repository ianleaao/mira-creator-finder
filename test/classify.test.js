// Testes das regras de aprovação (sem chamar o Claude).
const test = require('node:test');
const assert = require('node:assert');
const { applyRules, combine, sortCreators, buildPrompt, removeDashes } = require('../src/classify');

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
  host_left: false, theme_link: true, trigger_index: 0, niche: 'Family prepper',
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

test('prompt separa dados do canal como não confiáveis', () => {
  const c = creator();
  const prompt = buildPrompt(c, CTX, applyRules(c, CTX));
  assert.match(prompt, /<channel_data>[\s\S]*Prepping for families[\s\S]*<\/channel_data>/);
  assert.match(prompt, /0\. "Pentagon FORTRESS explained" \(2026-10-15\)/);
});

test('removeDashes troca travessão por vírgula e mantém hífen', () => {
  const emDash = String.fromCharCode(0x2014);
  assert.strictEqual(removeDashes(`Strong fit ${emDash} great trigger`), 'Strong fit, great trigger');
  assert.strictEqual(removeDashes('off-grid prepper'), 'off-grid prepper');
});
