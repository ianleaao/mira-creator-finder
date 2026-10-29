// Gera o CSV (colunas da seção "Saída" do CLAUDE.md) e o JSON (formato do SOP 17).

const fs = require('fs');
const path = require('path');
const { formatCount, formatRatio } = require('./metrics');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

const COLUMNS = [
  'Name of Account', 'Status', 'Why', 'Supervisor Feedback', 'Niche', 'Duplicate Check',
  'Trigger Content', 'Instagram', 'Instagram Followers', 'TikTok', 'TikTok Followers',
  'YouTube', 'YouTube Subscribers', 'Avg Video Views', 'Avg Shorts Views', 'Views/Subs Ratio',
  'Activity', 'Last Upload', 'Email', 'YouTube Business Email', 'Website', 'Other Links',
  'Best Contact Method', 'Specific Message', 'Additional Notes',
];

const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : '');

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Converte um creator (formato SOP 17) numa linha do CSV.
function toRow(c) {
  const yt = c.platforms.youtube;
  const ig = c.platforms.instagram;
  const tt = c.platforms.tiktok;
  const trigger = c.trigger_content
    ? `${c.trigger_content.title} | ${c.trigger_content.url} | ${c.trigger_content.date}`
    : '';

  let avgVideo = 'Not verified';
  if (yt.avg_video_views !== null) avgVideo = formatCount(yt.avg_video_views);
  else if (yt.long_videos_found === 0) avgVideo = 'No long videos';

  const activity = c.metrics.activity === 'Not verified'
    ? 'Not verified'
    : `${c.metrics.activity} (${c.metrics.days_since_upload} days)`;

  return {
    'Name of Account': c.name,
    'Status': c.status,
    'Why': c.why,
    'Supervisor Feedback': '',
    'Niche': c.niche,
    'Duplicate Check': c.duplicate_check,
    'Trigger Content': trigger,
    'Instagram': ig.url || '',
    'Instagram Followers': ig.url ? (ig.followers || 'Not verified') : '',
    'TikTok': tt.url || '',
    'TikTok Followers': tt.url ? (tt.followers || 'Not verified') : '',
    'YouTube': yt.url,
    'YouTube Subscribers': yt.subscribers === null ? 'Not verified' : formatCount(yt.subscribers),
    'Avg Video Views': avgVideo,
    'Avg Shorts Views': yt.avg_shorts_views === null ? 'No Shorts' : formatCount(yt.avg_shorts_views),
    'Views/Subs Ratio': formatRatio(c.metrics.views_to_subs_ratio),
    'Activity': activity,
    'Last Upload': dateOnly(yt.last_upload),
    'Email': c.contact.email || '',
    'YouTube Business Email': c.contact.youtube_business_email || '',
    'Website': c.contact.website || '',
    'Other Links': c.contact.other_links.join(' ; '),
    'Best Contact Method': c.contact.best_method || '',
    'Specific Message': c.message || '',
    'Additional Notes': c.notes.join('; '),
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(creators) {
  const lines = [COLUMNS.map(csvCell).join(',')];
  for (const c of creators) {
    const row = toRow(c);
    lines.push(COLUMNS.map((col) => csvCell(row[col])).join(','));
  }
  // BOM para o Excel no Windows reconhecer UTF-8 (acentos e emojis).
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Salva CSV e JSON. Devolve os caminhos.
function saveRound({ round, theme, creators, meta, date = new Date() }) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const roundPart = String(round).padStart(2, '0');
  const base = `round-${roundPart}-${slugify(theme)}-${dateOnly(date.toISOString())}`;
  const csvPath = path.join(OUTPUT_DIR, `${base}.csv`);
  const jsonPath = path.join(OUTPUT_DIR, `${base}.json`);
  fs.writeFileSync(csvPath, toCsv(creators), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify({ meta, creators }, null, 2), 'utf8');
  return { csvPath, jsonPath };
}

module.exports = { COLUMNS, toRow, toCsv, saveRound, slugify };
