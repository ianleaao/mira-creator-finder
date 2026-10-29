// Template da saída: colunas, larguras e cores. Usado pelo CSV e pela planilha do Google (Fase 5).
// Para mudar o layout, edite só este arquivo.
// Por enquanto: colunas da seção "Saída" do CLAUDE.md. O formato final será definido depois.

const { formatCount, formatRatio } = require('./metrics');

const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : '');

function avgVideo(c) {
  const yt = c.platforms.youtube;
  if (yt.avg_video_views !== null) return formatCount(yt.avg_video_views);
  return yt.long_videos_found === 0 ? 'No long videos' : 'Not verified';
}

function activity(c) {
  if (c.metrics.activity === 'Not verified') return 'Not verified';
  return `${c.metrics.activity} (${c.metrics.days_since_upload} days)`;
}

function trigger(c) {
  const t = c.trigger_content;
  return t ? `${t.title} | ${t.url} | ${t.date}` : '';
}

const followers = (platform) => (platform.url ? (platform.followers || 'Not verified') : '');

// header: título da coluna | width: largura em pixels na planilha | value: como preencher
const COLUMNS = [
  { header: 'Name of Account', width: 200, value: (c) => c.name },
  { header: 'Status', width: 110, value: (c) => c.status },
  { header: 'Why', width: 320, value: (c) => c.why },
  { header: 'Supervisor Feedback', width: 200, value: () => '' },
  { header: 'Niche', width: 220, value: (c) => c.niche },
  { header: 'Duplicate Check', width: 240, value: (c) => c.duplicate_check },
  { header: 'Trigger Content', width: 360, value: trigger },
  { header: 'Instagram', width: 200, value: (c) => c.platforms.instagram.url || '' },
  { header: 'Instagram Followers', width: 130, value: (c) => followers(c.platforms.instagram) },
  { header: 'TikTok', width: 200, value: (c) => c.platforms.tiktok.url || '' },
  { header: 'TikTok Followers', width: 130, value: (c) => followers(c.platforms.tiktok) },
  { header: 'YouTube', width: 260, value: (c) => c.platforms.youtube.url },
  {
    header: 'YouTube Subscribers',
    width: 130,
    value: (c) => (c.platforms.youtube.subscribers === null ? 'Not verified' : formatCount(c.platforms.youtube.subscribers)),
  },
  { header: 'Avg Video Views', width: 120, value: avgVideo },
  {
    header: 'Avg Shorts Views',
    width: 120,
    value: (c) => (c.platforms.youtube.avg_shorts_views === null ? 'No Shorts' : formatCount(c.platforms.youtube.avg_shorts_views)),
  },
  { header: 'Views/Subs Ratio', width: 140, value: (c) => formatRatio(c.metrics.views_to_subs_ratio) },
  { header: 'Activity', width: 140, value: activity },
  { header: 'Last Upload', width: 110, value: (c) => dateOnly(c.platforms.youtube.last_upload) },
  { header: 'Email', width: 220, value: (c) => c.contact.email || '' },
  { header: 'YouTube Business Email', width: 160, value: (c) => c.contact.youtube_business_email || '' },
  { header: 'Website', width: 200, value: (c) => c.contact.website || '' },
  { header: 'Other Links', width: 280, value: (c) => c.contact.other_links.join(' ; ') },
  { header: 'Best Contact Method', width: 140, value: (c) => c.contact.best_method || '' },
  { header: 'Specific Message', width: 400, value: (c) => c.message || '' },
  { header: 'Additional Notes', width: 360, value: (c) => c.notes.join('; ') },
];

// Cor do nome por status (convenção da Marie, SOP 9.2). Hex usado na planilha.
const STATUS_COLORS = {
  Approved: '#b7e1cd',      // verde
  Maybe: '#fce8b2',         // laranja
  'Not approved': '#f4c7c3', // vermelho
  '': '#c9daf8',            // azul: aguardando revisão
};

function toRow(creator) {
  return COLUMNS.map((col) => {
    const value = col.value(creator);
    return value === null || value === undefined ? '' : String(value);
  });
}

module.exports = { COLUMNS, STATUS_COLORS, toRow };
