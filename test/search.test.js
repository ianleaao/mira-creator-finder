// Teste do search em etapas, com o YouTube simulado (não gasta cota nem toca no Google).
const test = require('node:test');
const BRIEF = {
  mira_angle: 'wildfire smoke means respiratory protection for families',
  niche_keywords: ['wildfire', 'smoke', 'prepper', 'prepping', 'preparedness', 'bug out', 'go bag', 'evacuation', 'air quality', 'gas mask', 'respirator', 'homestead', 'off grid', 'emergency', 'survival', 'fire season'],
};
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const youtube = require('../src/youtube');
const { runSearch } = require('../src/pipeline');
const { writeJson, readJson, files } = require('../src/round');

const NOW = Date.now();
const iso = (daysAgo) => new Date(NOW - daysAgo * 86400000).toISOString();

const QUERIES = ['q1 wildfire vlog', 'q2 fire season', 'q3 evacuation', 'q4 smoke season', 'q5 defensible space',
  'q6 firefighter vlog', 'q7 fire country', 'q8 burn scar'];

// Cada busca devolve 2 canais. Alguns são mídia (pré-filtro) ou pequenos.
const CHANNELS = {
  UCnews: { title: 'KREM 2 News', subscribers: 100000 },
  UCsmall: { title: 'Tiny Homestead', subscribers: 4000 },
};
for (let i = 1; i <= 16; i++) CHANNELS[`UCc${i}`] = { title: `Prepper Creator ${i}`, subscribers: 20000 + i };
const PREP_VIDEOS = ['Bug out bag basics', 'Wildfire smoke prep', 'Power outage checklist', 'Emergency water storage', 'Go bag for kids',
  'Prepping on a budget', 'Evacuation plan', 'Gas mask basics', 'Grid down lighting'].map((title) => ({ title, date: '2026-10-01' }));
const RESULTS = {};
QUERIES.forEach((q, i) => {
  RESULTS[q] = i === 0 ? ['UCnews', 'UCsmall'] : [`UCc${i * 2 - 1}`, `UCc${i * 2}`];
});

function stubYoutube() {
  const calls = { search: [], videos: [] };
  youtube.searchVideos = async (q) => {
    calls.search.push(q);
    return RESULTS[q].map((id) => ({ videoId: `${id}-${q}`, channelId: id, channelTitle: CHANNELS[id].title, title: `${q} video`, publishedAt: iso(20) }));
  };
  youtube.getChannels = async (ids) => ids.map((id) => ({
    channelId: id, title: CHANNELS[id].title, handle: null, description: 'Contact: me@x.com', country: 'US',
    subscribers: CHANNELS[id].subscribers, subscribersHidden: false, videoCount: 50,
    uploadsPlaylist: `UU${id}`,
  }));
  youtube.getRecentTitles = async () => PREP_VIDEOS;
  youtube.getChannelVideos = async (ch) => {
    calls.videos.push(ch.channelId);
    const longVideos = Array.from({ length: 10 }, (_, i) => ({
      videoId: `${ch.channelId}v${i}`, title: `Video ${i}`, description: '', url: 'u', publishedAt: iso(10 + i), upcoming: false, views: 5000,
    }));
    return { longVideos, shortVideos: [], lastUpload: iso(10), shortsSource: 'playlist' };
  };
  return calls;
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-search-'));
  const f = files(dir);
  writeJson(f.round, { round: null, theme: 'WILDFIRE SMOKE', red_alert: false, window: null, target: 3, test_mode: true, criteria: null });
  writeJson(f.queries, { ...BRIEF, niche: 'n', trigger_content: 't', queries: QUERIES });
  return { dir, f };
}

const JUDGE = { brand_risk: false, competitor_seller: false, refuses_sponsorships: false, host_left: false,
  theme_link: true, niche_fit: 'strong', niche_evidence: ['Bug out bag basics'], recurring_theme: true, competitor_partner: '', trigger_index: 0, niche: 'x', why: 'x', confidence: 'high' };

test('search para quando tem candidatos suficientes e continua de onde parou', async () => {
  const calls = stubYoutube();
  const { dir, f } = setup();
  const original = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'teste';

  // Etapa 1: meta = 3 válidos, nenhum julgado: coleta 6 para julgar e para.
  const r1 = await runSearch(dir, () => {}, { sheetKeys: new Set(['ytid:UCc2']), mondayItems: [] });
  assert.strictEqual(r1.stats.toJudge, 6);
  assert.strictEqual(r1.stats.prefiltered, 1);    // KREM 2 News, sem coletar vídeos
  assert.strictEqual(r1.stats.small, 1);          // Tiny Homestead
  assert.strictEqual(r1.stats.excluded, 1);       // UCc2 já está na planilha do tema
  assert.ok(!calls.videos.includes('UCnews'));
  assert.ok(!calls.videos.includes('UCc2'));
  assert.ok(r1.stats.remainingQueries > 0, 'não gastou todas as buscas');
  const review = fs.readFileSync(f.review, 'utf8');
  assert.match(review, /KREM 2 News: TV station/);

  // Julgamento: 2 válidos, 4 reprovados. Falta 1 válido: etapa 2 busca mais 2.
  const state = readJson(f.candidates);
  const ids = state.creators.map((c) => c.platforms.youtube.channel_id);
  const judgments = {};
  ids.forEach((id, i) => {
    judgments[id] = { ...JUDGE, channel_type: 'creator', status: i < 2 ? 'Approved' : 'Not approved', theme_link: i < 2 };
  });
  writeJson(f.judgments, { judgments });

  const searchesBefore = calls.search.length;
  const r2 = await runSearch(dir, () => {}, { sheetKeys: new Set(['ytid:UCc2']), mondayItems: [] });
  assert.strictEqual(r2.stats.valid, 2);
  assert.strictEqual(r2.stats.toJudge, 2);
  assert.ok(calls.search.length > searchesBefore);
  assert.strictEqual(new Set(calls.search).size, calls.search.length, 'nenhuma busca repetida');
  assert.strictEqual(new Set(calls.videos).size, calls.videos.length, 'nenhum canal coletado duas vezes');
  const review2 = fs.readFileSync(f.review, 'utf8');
  assert.doesNotMatch(review2, new RegExp(`id: \`${ids[0]}\``), 'julgados ficam fora do review');

  // Com 3 válidos, o search não gasta mais nada.
  const state2 = readJson(f.candidates);
  for (const c of state2.creators) {
    const id = c.platforms.youtube.channel_id;
    if (!judgments[id]) judgments[id] = { ...JUDGE, channel_type: 'creator', status: 'Maybe' };
  }
  writeJson(f.judgments, { judgments });
  const before = calls.search.length;
  const r3 = await runSearch(dir, () => {}, { sheetKeys: new Set(), mondayItems: [] });
  assert.strictEqual(r3.stats.need, 0);
  assert.strictEqual(calls.search.length, before);

  if (original === undefined) delete process.env.YOUTUBE_API_KEY;
});

test('fila de coleta: faixa do SOP primeiro, gigantes no fim', () => {
  const { sortQueue } = require('../src/pipeline');
  const item = (id, subs, matches = 1) => ({ channel: { channelId: id, subscribers: subs, subscribersHidden: false }, matches: Array(matches).fill({}) });
  const q = sortQueue([item('giant', 36000000, 2), item('mid', 80000), item('small', 15000, 2), item('big', 900000)]);
  assert.deepStrictEqual(q.map((x) => x.channel.channelId), ['small', 'mid', 'big', 'giant']);
});

test('canal que já está no Monday sai da busca antes da coleta', async () => {
  const calls = stubYoutube();
  const { dir } = setup();
  process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'teste';
  const mondayItems = [{ name: 'Prepper Creator 1', handle: '', group: 'Messaged, but no reply yet' }];
  const r = await runSearch(dir, () => {}, { sheetKeys: new Set(), mondayItems });
  assert.strictEqual(r.stats.monday, 1);
  assert.ok(!calls.videos.includes('UCc1'));
});

test('countValid desconta quem já está no Monday', () => {
  const { countValid } = require('../src/pipeline');
  const { readJson: rj } = require('../src/round');
  const { dir, f } = setup();
  return (async () => {
    stubYoutube();
    process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'teste';
    await runSearch(dir, () => {}, { sheetKeys: new Set(), mondayItems: [] });
    const state = rj(f.candidates);
    const judgments = {};
    for (const c of state.creators) judgments[c.platforms.youtube.channel_id] = { ...JUDGE, channel_type: 'creator', status: 'Approved' };
    const total = countValid(state.creators, judgments, { redAlert: false }, []);
    const minusOne = countValid(state.creators, judgments, { redAlert: false }, [{ name: state.creators[0].name, handle: '', group: 'New Leads' }]);
    assert.strictEqual(minusOne, total - 1);
  })();
});

test('canal da fila antiga (títulos só como texto) mantém os títulos', () => {
  const { buildCreator } = require('../src/pipeline');
  const channel = { channelId: 'UCold', title: 'Old Prepper', handle: null, description: '', subscribers: 50000, subscribersHidden: false,
    recentTitles: ['Bug out bag basics', 'Wildfire smoke prep'] };
  const collected = { longVideos: [], shortVideos: [], lastUpload: null, shortsSource: 'playlist' };
  const c = buildCreator({ round: null, channel, collected, matches: [], now: new Date() });
  assert.deepStrictEqual(c.evidence.last_titles, ['Bug out bag basics', 'Wildfire smoke prep']);
  assert.deepStrictEqual(c.evidence.last_videos[0], { title: 'Bug out bag basics', date: '' });
});

test('fora do Red Alert, a busca pede só vídeos recentes e canais com gatilho antigo saem sem coleta', async () => {
  const calls = stubYoutube();
  const seen = [];
  const original = youtube.searchVideos;
  youtube.searchVideos = async (q, opts) => {
    seen.push(opts.publishedAfter);
    const list = await original(q, opts);
    // Primeiro canal com vídeo de 2020: deve sair sem coleta.
    return list.map((v, i) => (i === 0 ? { ...v, publishedAt: '2020-01-01T00:00:00Z' } : v));
  };
  const { dir } = setup();
  process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'teste';
  const r = await runSearch(dir, () => {}, { sheetKeys: new Set(), mondayItems: [] });
  assert.ok(seen.every((d) => /^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(d)), 'publishedAfter sempre definido');
  assert.ok(r.stats.oldTrigger >= 1);
  assert.ok(!calls.videos.includes('UCc1'));
});
