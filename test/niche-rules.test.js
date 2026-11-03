// Cenários reais da Round WILDFIRE SMOKE com as regras de encaixe na MIRA (sem chamar APIs).
const test = require('node:test');
const assert = require('node:assert');
const { applyRules, combine } = require('../src/classify');

const NOW = '2026-11-03T12:00:00Z';
const REG = { redAlert: false, window: null, triggerMaxAgeMonths: 12, allowedNiches: [], nicheKeywords: [], now: NOW };

function creator({ name, description = '', lastTitles, trigger, ratio = 'Good', email = 'hi@x.com', subscribers = 80000 }) {
  const ratios = { Good: 0.15, Acceptable: 0.05, Weak: 0.018 };
  return {
    name,
    status: '',
    why: '',
    niche: '',
    notes: [],
    mira_mention: false,
    platforms: {
      youtube: { subscribers, avg_video_views: 6000, avg_shorts_views: null, last_upload: '2026-10-30T00:00:00Z' },
      instagram: { url: null },
      tiktok: { url: null },
    },
    metrics: { views_to_subs_ratio: { ratio: ratios[ratio], label: ratio }, activity: 'Active', days_since_upload: 4 },
    contact: { email },
    evidence: {
      channel_description: description,
      search_matches: [{ title: trigger.title, url: 'https://www.youtube.com/watch?v=t', date: trigger.date }],
      recent_titles: lastTitles.slice(0, 10),
      last_titles: lastTitles,
    },
  };
}

function judgment(overrides = {}) {
  return {
    channel_type: 'creator', niche_fit: 'strong', niche_evidence: [], recurring_theme: true, theme_link: true,
    trigger_index: 0, competitor_partner: '', brand_risk: false, competitor_seller: false, refuses_sponsorships: false,
    host_left: false, niche: 'x', status: 'Approved', why: 'judged by the session', confidence: 'high', ...overrides,
  };
}

const run = (c, j, ctx = REG) => combine(c, applyRules(c, ctx), j, ctx);

const FOOD_TITLES = [
  'The Bulk Food Fridge Setup That Feeds 8 Without the Chaos', '14 Lost Frugal Habits for a Simpler Life',
  'Bulk Baking + Cooking Systems', 'Bulk Salsa Canning for our Family of 8', 'The Kitchen Setup That Makes Scratch Cooking Easy',
  'Vacuum Seal Harvest Tips', 'Finding real joy in an ordinary life', 'Why batch cooking changes your routine',
  'Frugal does not mean miserable', 'The truth about homemaker burnout', 'Frugal Living for a Lovely Home',
  'Cozy Autumn Homemaking', 'Preparing Our Winter Pantry', 'Why We Stopped Canning These',
  'Wildfire Threat | Living Under a Wildfire Evacuation Notice',
];
const PREPPER_TITLES = [
  'Bug Out Bag 2026 Full Loadout', 'Wildfire Smoke Protection for Your Family', 'Power Outage Prep Checklist',
  'Emergency Water Storage Basics', 'Prepping on a Budget', 'Gas Mask Basics for Beginners', 'Get Home Bag Update',
  'Grid Down Lighting Options', 'Evacuation Plan for Fire Season', 'Channel update', 'Q and A live', 'Thanks for 50K',
  'Shop tour', 'Behind the scenes', 'Road trip',
];

test('canal de gaming com 1 vídeo de evacuação: Not approved (Outside MIRA niche)', () => {
  const c = creator({
    name: 'Markiplier',
    description: 'I make videos: scary games, comedy sketches, animations.',
    lastTitles: ['BARN OF DOOM', 'REANIMAL Part 2', 'SECURITY BOOTH SIMULATOR', 'I Was Evacuated from the LA Fires', '3 SCARY GAMES #115'],
    trigger: { title: 'I Was Evacuated from the LA Fires', date: '2025-01-13' },
  });
  const r = run(c, judgment({ niche_evidence: ['I Was Evacuated from the LA Fires'] }));
  assert.strictEqual(r.status, 'Not approved');
  assert.strictEqual(r.why, 'Outside MIRA niche');
});

test('casal de viagem com 1 vídeo de incêndio de 2024: Not approved', () => {
  const c = creator({
    name: 'Sam and Kelly',
    description: 'We converted a Sprinter van into a tiny home on wheels and travel full time.',
    lastTitles: ['6:20pm in Kauai #travel', 'Greece Does Not Have to Be Expensive', 'The HARDEST part about life on the road #vanlife', 'Our 3 RV Life Non Negotiables', 'POV: a guest in our RV'],
    trigger: { title: 'Evacuating the Malibu Wildfire in A School Bus', date: '2024-12-11' },
  });
  const r = run(c, judgment({ niche_fit: 'partial', niche_evidence: ['Our 3 RV Life Non Negotiables'], status: 'Maybe' }));
  assert.strictEqual(r.status, 'Not approved');
  assert.strictEqual(r.why, 'Outside MIRA niche');
});

test('canal tático com gatilho de 2023 sobre outro assunto e "ft. Parcil": Not approved, Parcil anotado', () => {
  const c = creator({
    name: 'Civilian Tactical',
    description: 'Firearms, tactical gear and survival reviews.',
    lastTitles: ['Best Budget AR-15 Optics', 'Tactical Vest Setup', 'Survival Knife Review', 'EDC Loadout 2026', 'Gas Mask Review ft. Parcil\'s Gas Masks'],
    trigger: { title: 'Gas Mask Review ft. Parcil\'s Gas Masks', date: '2023-05-10' },
    ratio: 'Weak',
    subscribers: 3740000,
  });
  const r = run(c, judgment({ niche_evidence: ['Tactical Vest Setup', 'EDC Loadout 2026'], trigger_index: -1, competitor_partner: 'Parcil' }));
  assert.strictEqual(r.status, 'Not approved');
  assert.strictEqual(r.why, 'No trigger video about the Round theme');
  assert.ok(r.notes.includes('Promotes competitor brand: Parcil'));
});

test('homestead de comida e família com 1 vídeo de evacuação de 2026: Not approved (Outside MIRA niche)', () => {
  const c = creator({
    name: 'Mountain Mama\'s Home',
    description: 'Simple, frugal, from-scratch homemaking. Wife, mama to 6, mountain homesteader and homeschooler.',
    lastTitles: FOOD_TITLES,
    trigger: { title: 'Wildfire Threat | Living Under a Wildfire Evacuation Notice', date: '2026-07-27' },
  });
  const r = run(c, judgment({ niche_evidence: ['Preparing Our Winter Pantry', 'Wildfire Threat | Living Under a Wildfire Evacuation Notice'] }));
  assert.strictEqual(r.status, 'Not approved');
  assert.strictEqual(r.why, 'Outside MIRA niche');
  assert.ok(r.notes.some((n) => /Adjacent niche with only \d+\/15 preparedness titles/.test(n)));
});

test('canal prepper com 9/15 títulos de preparação, vídeo de 2026, ratio Good e e-mail: Approved', () => {
  const c = creator({
    name: 'Prepper Dawg',
    description: 'Practical preparedness for families.',
    lastTitles: PREPPER_TITLES,
    trigger: { title: 'Wildfire Smoke: How We Protect Our Family Indoors', date: '2026-08-20' },
  });
  const r = run(c, judgment({ niche_evidence: ['Bug Out Bag 2026 Full Loadout', 'Power Outage Prep Checklist'] }));
  assert.strictEqual(r.status, 'Approved');
  assert.strictEqual(r.nicheScore.label, '9/15');
});

test('canal de comida numa Round com allowed_niches family e food storage: pode passar', () => {
  const titles = [...FOOD_TITLES.slice(0, 12), 'Our Family Food Storage Plan', 'Family Emergency Pantry Checklist', 'Holiday Prep Gift Guide for Families'];
  const c = creator({
    name: 'Mountain Mama\'s Home',
    description: 'Frugal from-scratch homemaking for a family of 8. Food storage and pantry.',
    lastTitles: titles,
    trigger: { title: 'Holiday Prep Gift Guide for Families', date: '2026-10-20' },
  });
  const ctx = { ...REG, allowedNiches: ['family', 'food storage'] };
  const r = run(c, judgment({ niche_evidence: ['Our Family Food Storage Plan', 'Family Emergency Pantry Checklist'] }), ctx);
  assert.notStrictEqual(r.status, 'Not approved');
  // Sem a liberação da Round, o mesmo canal fica fora do nicho.
  assert.strictEqual(run(c, judgment({ niche_evidence: ['Our Family Food Storage Plan'] })).why, 'Outside MIRA niche');
});

test('homestead com gatilho de 2024 e ratio Weak: Not approved', () => {
  const c = creator({
    name: 'Prairie Prepper Homestead',
    description: 'Homesteading and preparedness on the prairie.',
    lastTitles: PREPPER_TITLES,
    trigger: { title: 'How to Prepare Your Homestead for Wildfire', date: '2024-11-18' },
    ratio: 'Weak',
  });
  const r = run(c, judgment({ niche_evidence: ['Bug Out Bag 2026 Full Loadout'] }));
  assert.strictEqual(r.status, 'Not approved');
  assert.match(r.why, /older than 12 months|Two or more weak points/);
});

test('ratio Weak só vira Maybe com nicho forte e tema recorrente; senão reprova', () => {
  const base = { name: 'Prepper Dawg', description: 'Preparedness.', lastTitles: PREPPER_TITLES, trigger: { title: 'Wildfire smoke prep', date: '2026-09-01' }, ratio: 'Weak' };
  assert.strictEqual(run(creator(base), judgment({ niche_evidence: ['Prepping on a Budget'] })).status, 'Maybe');
  const r = run(creator(base), judgment({ niche_evidence: ['Prepping on a Budget'], recurring_theme: false }));
  assert.strictEqual(r.status, 'Not approved');
  assert.match(r.why, /^Weak views\/subs ratio/);
});

test('julgamento com niche_evidence inventado é rebaixado para niche_fit none', () => {
  const c = creator({ name: 'Prepper Dawg', description: 'Preparedness.', lastTitles: PREPPER_TITLES, trigger: { title: 'Wildfire smoke prep', date: '2026-09-01' } });
  const r = run(c, judgment({ niche_evidence: ['A Title That Does Not Exist'] }));
  assert.strictEqual(r.nicheFit, 'none');
  assert.strictEqual(r.status, 'Not approved');
  assert.ok(r.notes.includes('niche_evidence has titles not found in the collected data'));
  assert.strictEqual(run(c, judgment({ niche_evidence: [] })).nicheFit, 'none');
});

test('gatilho dentro da idade liberada pela Round (--trigger-age 24)', () => {
  const c = creator({ name: 'Prepper Dawg', description: 'Preparedness.', lastTitles: PREPPER_TITLES, trigger: { title: 'Wildfire smoke prep', date: '2025-03-01' } });
  const j = judgment({ niche_evidence: ['Prepping on a Budget'] });
  assert.strictEqual(run(c, j).status, 'Not approved');
  assert.strictEqual(run(c, j, { ...REG, triggerMaxAgeMonths: 24 }).status, 'Approved');
});
