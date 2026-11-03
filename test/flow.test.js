// Teste do fluxo search (parte offline) + finalize, numa pasta temporária, sem APIs.
const test = require('node:test');
const BRIEF = {
  mira_angle: 'wildfire smoke means respiratory protection for families',
  niche_keywords: ['wildfire', 'smoke', 'prepper', 'prepping', 'preparedness', 'bug out', 'go bag', 'evacuation', 'air quality', 'gas mask', 'respirator', 'homestead', 'off grid', 'emergency', 'survival', 'fire season'],
};
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildCreator, finalizeRound } = require('../src/pipeline');
const { buildReview } = require('../src/review');
const { loadQueries } = require('../src/brief');
const { writeJson, files } = require('../src/round');

const NOW = new Date();
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const INFO = {
  round: 25, theme: 'Pentagon FORTRESS', red_alert: true,
  window: { from: daysAgo(30).slice(0, 10), to: daysAgo(0).slice(0, 10) }, target: 20, limit: 40,
};

function makeCreator(id, name, subscribers, email) {
  const channel = {
    channelId: id, title: name, handle: `@${name.replace(/\W/g, '').toLowerCase()}`,
    description: email ? `Contact: ${email}` : 'Prepping videos', subscribers, subscribersHidden: false, videoCount: 100,
  };
  const longVideos = Array.from({ length: 10 }, (_, i) => ({
    videoId: `${id}v${i}`, title: `Video ${i}`, description: '', url: `https://www.youtube.com/watch?v=${id}v${i}`,
    publishedAt: daysAgo(8 + i), upcoming: false, views: 8000,
  }));
  const matches = [{ videoId: `${id}t`, title: 'Pentagon FORTRESS 90 days', publishedAt: daysAgo(5), query: 'q' }];
  return buildCreator({ round: 25, channel, collected: { longVideos, shortVideos: [], lastUpload: daysAgo(8), shortsSource: 'playlist' }, matches, now: NOW });
}

const GOOD_EMAIL = [
  'Subject: Potential Collaboration with MIRA Safety',
  '',
  'Hey Good Prepper team,',
  '',
  'Bryce here from MIRA Safety. I recently came across your video "Pentagon FORTRESS 90 days" and liked how practical it was.',
  '',
  'At MIRA Safety, we specialize in gas masks, filters, and other personal protective equipment, and your viewers already plan ahead.',
  '',
  "We'd love to explore a potential collaboration with you! One idea is showing a gas mask in your family's emergency kit. Another is a hands-on look at how you would use it. We're also happy to hear any ideas you have!",
  '',
  'Would you be interested in collaborating with us? If so, feel free to grab a time for a quick chat here: https://calendly.com/bryce-g-mirasafety/30min',
  '',
  'Talk soon,',
  'Bryce',
].join('\n');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mira-round-'));
}

test('loadQueries limpa e avisa', () => {
  const dir = tempDir();
  const file = path.join(dir, 'queries.json');
  writeJson(file, { ...BRIEF, niche: 'preppers', trigger_content: 'video on FORTRESS', queries: ['a youtube', 'site:x.com b', 'A'] });
  const q = loadQueries(file);
  assert.deepStrictEqual(q.queries, ['a', 'b']);
  assert.strictEqual(q.niche, 'preppers');
});

test('review separa quem precisa de julgamento', () => {
  const creators = [makeCreator('UCa', 'Good Prepper', 50000, 'a@a.com'), makeCreator('UCb', 'Tiny', 4000, null)];
  const review = buildReview(INFO, { niche: 'preppers', triggerContent: 'FORTRESS video' }, creators);
  assert.strictEqual(review.toJudge, 1);
  assert.strictEqual(review.failed, 1);
  assert.match(review.markdown, /id: `UCa`/);
  assert.match(review.markdown, /0\. Pentagon FORTRESS 90 days/);
  assert.match(review.markdown, /- Tiny: Too small \(4K subscribers\)/);
});

test('finalize junta julgamentos e mensagens e gera o CSV', async () => {
  const dir = tempDir();
  const f = files(dir);
  const creators = [
    makeCreator('UCa', 'Good Prepper', 50000, 'a@a.com'),
    makeCreator('UCb', 'Tiny', 4000, null),
    makeCreator('UCc', 'News Daily', 80000, 'n@n.com'),
  ];
  writeJson(f.candidates, { meta: INFO, creators });

  const base = {
    brand_risk: false, competitor_seller: false, refuses_sponsorships: false, host_left: false,
    theme_link: true, niche_fit: 'strong', niche_evidence: ['Video 0'], recurring_theme: true, competitor_partner: '', trigger_index: 0, niche: 'Prepper', confidence: 'high',
  };
  writeJson(f.judgments, {
    judgments: {
      UCa: { ...base, channel_type: 'creator', status: 'Approved', why: 'Prepper with FORTRESS video' },
      UCc: { ...base, channel_type: 'media', status: 'Approved', why: 'News' },
    },
  });
  writeJson(f.messages, {
    messages: {
      UCa: { type: 'email', message: GOOD_EMAIL },
      UCc: { type: 'email', message: 'should be ignored' },
    },
  });

  const result = await finalizeRound(dir, { sheet: false, monday: false });
  assert.deepStrictEqual(result.counts, { approved: 1, maybe: 0, notApproved: 2, valid: 1, target: 20 });
  assert.strictEqual(result.creators[0].name, 'Good Prepper');
  assert.ok(result.warnings.some((w) => w.includes('News Daily')));

  const csv = fs.readFileSync(result.csvPath, 'utf8');
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines.length, 4);
  assert.match(lines[1], /^Good Prepper,Approved,Prepper with FORTRESS video,/);
  assert.match(lines[1], /calendly\.com/);
  assert.match(csv, /News Daily,Not approved,Outside MIRA niche/);
});

test('finalize recusa quando falta julgamento', async () => {
  const dir = tempDir();
  const f = files(dir);
  writeJson(f.candidates, { meta: INFO, creators: [makeCreator('UCa', 'Good Prepper', 50000, 'a@a.com')] });
  writeJson(f.judgments, { judgments: {} });
  await assert.rejects(() => finalizeRound(dir, { sheet: false, monday: false }), /Faltam julgamentos para 1 canal/);
});

test('buscas sobre produto são recusadas; buscas sobre o assunto passam', () => {
  const dir = tempDir();
  const file = path.join(dir, 'queries.json');
  writeJson(file, { ...BRIEF, queries: ['wildfire evacuation vlog', 'best mask wildfire smoke', 'respirator review'] });
  assert.throws(() => loadQueries(file), /best mask wildfire smoke[\s\S]*respirator review/);
  const good = ['wildfire evacuation vlog', 'living in wildfire country', 'fire season prep homestead',
    'we evacuated from the wildfire', 'smoke season family california', 'wildland firefighter vlog',
    'defensible space homestead', 'wildfire smoke day with kids'];
  writeJson(file, { ...BRIEF, queries: good });
  assert.strictEqual(loadQueries(file).queries.length, 8);
});

test('nome da pasta com e sem número da Round', () => {
  const { roundDirName } = require('../src/round');
  assert.strictEqual(roundDirName(null, 'PENTAGON'), 'pentagon');
  assert.strictEqual(roundDirName(25, 'Pentagon FORTRESS'), 'round-25-pentagon-fortress');
});

test('nomes no Drive: pasta do tema, planilha e sufixo sem sobrescrever', () => {
  const { sheetBaseName, themeFolderName, uniqueName } = require('../src/sources/drive');
  assert.strictEqual(themeFolderName('  pentagon  fortress '), 'PENTAGON FORTRESS');
  assert.strictEqual(sheetBaseName('Pentagon', 25, '2026-10-29'), 'Round 25 - PENTAGON - 2026-10-29');
  assert.strictEqual(sheetBaseName('Pentagon', null, '2026-10-29'), 'PENTAGON - 2026-10-29');
  const base = 'PENTAGON - 2026-10-29';
  assert.strictEqual(uniqueName(base, new Set()), base);
  assert.strictEqual(uniqueName(base, new Set([base, `${base} (2)`])), `${base} (3)`);
});

test('letra da coluna para colunas além do Z', () => {
  const { columnLetter } = require('../src/sources/drive');
  assert.strictEqual(columnLetter(0), 'A');
  assert.strictEqual(columnLetter(25), 'Z');
  assert.strictEqual(columnLetter(26), 'AA');
});

test('títulos da busca com códigos HTML são convertidos', () => {
  const { decodeHtml } = require('../src/youtube');
  assert.strictEqual(decodeHtml('Cloth masks won&#39;t &amp; &quot;smoke&quot;'), "Cloth masks won't & \"smoke\"");
});

test('pré-filtro descarta mídia, marca, governo e loja e deixa creators passarem', () => {
  const { prefilter } = require('../src/prefilter');
  const p = (title, description = '') => prefilter({ title, description, handle: '' });
  assert.match(p('KREM 2 News'), /TV station/);
  assert.match(p('ABC10'), /TV station/);
  assert.match(p('3M'), /Brand/);
  assert.match(p('CAL FIRE'), /Government/);
  assert.match(p('Wildfire Info', 'Official channel of the county. Visit ready.gov'), /Government/);
  assert.match(p('Bass Pro Shops'), /Store/);
  for (const ok of ['Civilian Tactical', 'City Prepping', 'Abc Homestead', 'Foxtrot Prepping', 'Wildland Fire Guy']) {
    assert.strictEqual(p(ok), null, ok);
  }
});

test('countValid conta só Approved e Maybe já julgados', () => {
  const { countValid } = require('../src/pipeline');
  const a = makeCreator('UCa', 'Good Prepper', 50000, 'a@a.com');
  const b = makeCreator('UCb', 'Other', 50000, 'b@b.com');
  const c = makeCreator('UCc', 'Media', 50000, 'c@c.com');
  const base = { brand_risk: false, competitor_seller: false, refuses_sponsorships: false, host_left: false,
    theme_link: true, niche_fit: 'strong', niche_evidence: ['Video 0'], recurring_theme: true, competitor_partner: '', trigger_index: 0, niche: 'x', confidence: 'high', why: 'x' };
  const j = {
    UCa: { ...base, channel_type: 'creator', status: 'Approved' },
    UCc: { ...base, channel_type: 'media', status: 'Approved' },
  };
  assert.strictEqual(countValid([a, b, c], j, { redAlert: false }), 1);
  assert.strictEqual(a.status, '', 'não altera os objetos originais');
});

test('pré-filtro pega sigla de emissora em maiúsculas e jornal pela descrição', () => {
  const { prefilter } = require('../src/prefilter');
  assert.match(prefilter({ title: 'KVUE', description: '', handle: '' }), /TV station/);
  assert.match(prefilter({ title: 'Guardian Australia', description: 'The latest news videos from Guardian Australia.', handle: '' }), /TV station/);
  assert.strictEqual(prefilter({ title: 'Kane Bailey', description: '', handle: '' }), null);
  assert.strictEqual(prefilter({ title: 'KaneBailey', description: '', handle: '' }), null);
});

test('revisão das mensagens segue o passo 9 do roteiro', () => {
  const { reviewMessage } = require('../src/messages');
  assert.deepStrictEqual(reviewMessage(GOOD_EMAIL), []);
  const both = GOOD_EMAIL.replace('gas masks, filters', 'gas masks, respirators, filters');
  assert.ok(reviewMessage(both).some((p) => p.includes('juntos')));
  assert.ok(reviewMessage(GOOD_EMAIL.replace('One idea is', 'One idea is a sponsored video')).some((p) => p.includes('patrocínio')));
  assert.ok(reviewMessage(GOOD_EMAIL.replace('Talk soon,', 'Thanks,')).length > 0);
  const dash = GOOD_EMAIL.replace('and liked', String.fromCharCode(0x2014) + ' liked');
  assert.ok(reviewMessage(dash).includes('tem travessão'));
});

test('finalize recusa mensagem reprovada na revisão', async () => {
  const dir = tempDir();
  const f = files(dir);
  writeJson(f.candidates, { meta: INFO, creators: [makeCreator('UCa', 'Good Prepper', 50000, 'a@a.com')] });
  const base = { brand_risk: false, competitor_seller: false, refuses_sponsorships: false, host_left: false,
    theme_link: true, niche_fit: 'strong', niche_evidence: ['Video 0'], recurring_theme: true, competitor_partner: '', trigger_index: 0, niche: 'Prepper', confidence: 'high' };
  writeJson(f.judgments, { judgments: { UCa: { ...base, channel_type: 'creator', status: 'Approved', why: 'ok' } } });
  writeJson(f.messages, { messages: { UCa: { type: 'email', message: 'Hey, want a sponsored video? https://calendly.com/bryce-g-mirasafety/30min' } } });
  await assert.rejects(() => finalizeRound(dir, { sheet: false, monday: false }), /reprovadas na revisão/);
});

test('pistas de nome vêm de frases explícitas, nunca do e-mail', () => {
  const { nameHints } = require('../src/messages');
  const hints = nameHints([
    { source: 'canal', text: "I'm Shayla: wife of 22 years. Business: lilly.j@gmail.com" },
    { source: 'video', text: 'Hi friends, my name is Ben and this is our farm' },
  ]);
  assert.deepStrictEqual(hints.map((h) => h.name), ['Shayla', 'Ben']);
});

test('buscas TEMA + NICHO: produto genérico até 1/3, marca concorrente nunca', () => {
  const dir = tempDir();
  const file = path.join(dir, 'queries.json');
  const ian = ['prepper wildfire season', 'wildfire smoke prepping', 'homestead wildfire preparation', 'wildfire go bag',
    'bug out bag wildfire', 'protect family from wildfire smoke', 'wildfire smoke air quality home', 'wildland firefighter gear',
    'off grid wildfire season', 'emergency preparedness wildfire', 'N95 vs gas mask wildfire smoke'];
  writeJson(file, { ...BRIEF, queries: ian });
  assert.strictEqual(loadQueries(file).queries.length, 11);

  writeJson(file, { ...BRIEF, queries: [...ian.slice(0, 8), '3M respirator wildfire'] });
  assert.throws(() => loadQueries(file), /marca[\s\S]*3M respirator wildfire/);

  const tooMany = ['mask wildfire', 'respirator smoke', 'filter fire season', 'gear wildfire', 'prepper wildfire', 'homestead fire', 'bug out fire', 'off grid fire', 'wildfire smoke prep'];
  writeJson(file, { ...BRIEF, queries: tooMany });
  assert.throws(() => loadQueries(file), /4 de 9 buscas; o limite é 1\/3 \(3\)/);
});

test('niche_score não conta churrasco defumado como nicho', () => {
  const { nicheScore } = require('../src/niche');
  assert.strictEqual(nicheScore(['How to Smoke Brisket Hot & Fast on a Drum Smoker', 'Smoked turkey recipe']).count, 0);
  assert.strictEqual(nicheScore(['Wildfire smoke day with the kids', 'Smoke season prep list']).label, '2/2');
  // Comida e casa nunca contam, mesmo com palavra de preparação.
  assert.strictEqual(nicheScore(['Emergency pantry canning recipe', 'Bug out bag basics']).count, 1);
});

test('review.md mostra niche_score, perfil, competitor_flags e idade do gatilho', () => {
  const c = makeCreator('UCz', 'Prepper Zed', 50000, 'z@z.com');
  c.evidence.topic_categories = ['Lifestyle (sociology)'];
  c.evidence.last_videos = [
    { title: 'Bug out bag basics', date: '2026-10-01' }, { title: 'Wildfire smoke prep', date: '2026-09-20' },
    { title: 'Gas mask review ft. Parcil', date: '2026-09-01' }, { title: 'Canning peaches recipe', date: '2026-08-15' },
  ];
  c.evidence.competitor_flags = ['Parcil'];
  const review = buildReview(INFO, { niche: 'preppers', miraAngle: 'smoke = respiratory protection' }, [c], { now: NOW.toISOString() });
  assert.match(review.markdown, /niche_score: 3\/4 títulos de preparação/);
  assert.match(review.markdown, /competitor_flags: Parcil/);
  assert.match(review.markdown, /Perfil do canal: /);
  assert.match(review.markdown, /- Bug out bag basics \(2026-10-01\)/);
  assert.match(review.markdown, /0\. Pentagon FORTRESS 90 days \(\d{4}-\d{2}-\d{2}, 0 meses\)/);
  assert.match(review.markdown, /MIRA angle: smoke = respiratory protection/);
});
