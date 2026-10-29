// Métricas do SOP seção 6: médias de views, outliers, ratio views/inscritos e atividade.
// Funções puras (sem chamadas externas), fáceis de testar.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VIDEOS = 10;        // SOP 6.1: últimos 10 vídeos
const MIN_AGE_DAYS = 7;       // SOP 6.1: ignorar vídeos com menos de 7 dias
const OUTLIER_FACTOR = 5;     // SOP 6.1: viral = mais de 5x a mediana

// Converte views em número. Aceita número, "12 thousand views", "12K views",
// "1.2M", "1,234 views", "No views". Devolve null se não der para entender.
function parseViews(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  const text = String(value).toLowerCase().replace(/views?/g, '').trim();
  if (text === '' ) return null;
  if (text === 'no') return 0;

  const match = text.match(/^([\d.,]+)\s*(thousand|million|billion|k|m|b)?$/);
  if (!match) return null;

  const multipliers = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9 };
  const unit = match[2];
  // Com unidade, a vírgula pode ser decimal ("1,2K"); sem unidade, é separador de milhar.
  const digits = unit ? match[1].replace(',', '.') : match[1].replace(/[.,]/g, '');
  const number = parseFloat(digits);
  if (!Number.isFinite(number)) return null;

  return Math.round(number * (unit ? multipliers[unit] : 1));
}

// Formata números como 950, 1.2K, 12K, 184K, 1.2M, 15M.
function formatCount(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const units = [
    { value: 1e9, suffix: 'B' },
    { value: 1e6, suffix: 'M' },
    { value: 1e3, suffix: 'K' },
  ];
  for (let i = 0; i < units.length; i++) {
    const { value, suffix } = units[i];
    if (n < value) continue;
    const scaled = n / value;
    // Uma casa decimal abaixo de 10 (1.2K), inteiro acima (12K).
    let rounded = scaled < 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled);
    // Evita "1000K": sobe para a unidade de cima.
    if (rounded >= 1000 && i > 0) {
      const upper = units[i - 1];
      return `${Math.round((n / upper.value) * 10) / 10}${upper.suffix}`;
    }
    return `${rounded}${suffix}`;
  }
  return String(Math.round(n));
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysBetween(dateString, now) {
  return Math.floor((now.getTime() - new Date(dateString).getTime()) / DAY_MS);
}

// Média de views (SOP 6.1 e 6.2).
// videos: [{ title, url, publishedAt, views, upcoming }]
// Regra (decisão do Ian): primeiro pula lives/premieres agendadas, vídeos com
// menos de 7 dias e vídeos sem contagem de views; depois pega os 10 mais recentes.
function averageViews(videos, now = new Date()) {
  const eligible = videos
    .filter((v) => !v.upcoming)
    .filter((v) => v.publishedAt && daysBetween(v.publishedAt, now) >= MIN_AGE_DAYS)
    .map((v) => ({ ...v, views: parseViews(v.views) }))
    .filter((v) => v.views !== null)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_VIDEOS);

  if (eligible.length === 0) {
    return { average: null, count: 0, viral: null };
  }

  // Outlier: só exclui se for UM único vídeo acima de 5x a mediana.
  let used = eligible;
  let viral = null;
  if (eligible.length >= 3) {
    const med = median(eligible.map((v) => v.views));
    const outliers = eligible.filter((v) => v.views > OUTLIER_FACTOR * med);
    if (outliers.length === 1) {
      viral = outliers[0];
      used = eligible.filter((v) => v !== viral);
    }
  }

  const total = used.reduce((sum, v) => sum + v.views, 0);
  return { average: Math.round(total / used.length), count: used.length, viral };
}

// Proporção views/inscritos (SOP 6.5).
function viewsToSubsRatio(avgViews, subscribers) {
  if (!avgViews || !subscribers) return null;
  const ratio = avgViews / subscribers;
  let label = 'Weak';
  if (ratio >= 0.10) label = 'Good';
  else if (ratio >= 0.03) label = 'Acceptable';
  return { ratio, label };
}

function formatRatio(result) {
  if (!result) return 'Not verified';
  const pct = result.ratio * 100;
  const shown = pct < 10 ? pct.toFixed(1) : Math.round(pct);
  return `${shown}% (${result.label})`;
}

// Atividade pelo último upload (SOP 6.4).
function activity(lastUpload, now = new Date()) {
  if (!lastUpload) return { label: 'Not verified', days: null };
  const days = daysBetween(lastUpload, now);
  let label = 'Inactive';
  if (days <= 30) label = 'Active';
  else if (days <= 90) label = 'Attention';
  return { label, days };
}

module.exports = {
  parseViews,
  formatCount,
  median,
  averageViews,
  viewsToSubsRatio,
  formatRatio,
  activity,
  daysBetween,
};
