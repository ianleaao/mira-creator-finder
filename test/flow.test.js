// Teste do fluxo search (parte offline) + finalize, numa pasta temporária, sem APIs.
const test = require('node:test');
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

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mira-round-'));
}

test('loadQueries limpa e avisa', () => {
  const dir = tempDir();
  const file = path.join(dir, 'queries.json');
  writeJson(file, { niche: 'preppers', trigger_content: 'video on FORTRESS', queries: ['a youtube', 'site:x.com b', 'A'] });
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

test('finalize junta julgamentos e mensagens e gera o CSV', () => {
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
    theme_link: true, trigger_index: 0, niche: 'Prepper', confidence: 'high',
  };
  writeJson(f.judgments, {
    judgments: {
      UCa: { ...base, channel_type: 'creator', status: 'Approved', why: 'Prepper with FORTRESS video' },
      UCc: { ...base, channel_type: 'media', status: 'Approved', why: 'News' },
    },
  });
  writeJson(f.messages, {
    messages: {
      UCa: { type: 'email', message: 'Hey Good Prepper, ... https://calendly.com/bryce-g-mirasafety/30min' },
      UCc: { type: 'email', message: 'should be ignored' },
    },
  });

  const result = finalizeRound(dir);
  assert.deepStrictEqual(result.counts, { approved: 1, maybe: 0, notApproved: 2 });
  assert.strictEqual(result.creators[0].name, 'Good Prepper');
  assert.ok(result.warnings.some((w) => w.includes('News Daily')));

  const csv = fs.readFileSync(result.csvPath, 'utf8');
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines.length, 4);
  assert.match(lines[1], /^Good Prepper,Approved,Prepper with FORTRESS video,/);
  assert.match(lines[1], /calendly\.com/);
  assert.match(csv, /News Daily,Not approved,"Media or news aggregator, not a creator"/);
});

test('finalize recusa quando falta julgamento', () => {
  const dir = tempDir();
  const f = files(dir);
  writeJson(f.candidates, { meta: INFO, creators: [makeCreator('UCa', 'Good Prepper', 50000, 'a@a.com')] });
  writeJson(f.judgments, { judgments: {} });
  assert.throws(() => finalizeRound(dir), /Faltam julgamentos para 1 canal/);
});
