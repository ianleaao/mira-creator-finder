// Transforma o tema da Round em buscas para o YouTube (SOP seções 1 e 3.2).

const { MODELS, askJson } = require('./claude');

const MIN_QUERIES = 8;
const MAX_QUERIES = 15;

const SYSTEM = `You help MIRA Safety find content creators for its affiliate program.
MIRA Safety sells gas masks, respirators, filters and emergency preparedness gear.
Given the theme of an outreach Round, you write YouTube search queries that surface creators
(not news outlets or stores) who posted content about that theme.

Rules:
- Write between ${MIN_QUERIES} and ${MAX_QUERIES} queries, in English.
- Queries are typed into the YouTube search box: no "site:" operators, no word "youtube", no boolean operators.
- Mix: the official name of the theme, its variations and related phrasing, the target niche
  (preppers, survival, military and veterans, homesteading, preparedness families), and reaction or explainer angles.
- For news-driven (Red Alert) Rounds, include variations of the story, not just its official name:
  key people, numbers, places and related news in the same wave.
- Keep each query short (2 to 7 words). Quotes are allowed around an exact phrase.
- Do not invent facts about the theme. If you are unsure what the theme refers to, stay close to its literal words.

Examples from past Rounds:
- Round 21, "Family Preparedness Creators (Holiday Gift Season)": prepper gift guide 2025, christmas gifts for preppers,
  stocking stuffers for preppers, emergency preparedness gift ideas family, homestead gift guide preparedness, 72 hour kit christmas gift
- Round 25, "Pentagon FORTRESS" (Red Alert): "Pentagon FORTRESS", "90 days off grid" Pentagon prepper, "Hegseth 90 days",
  "military bases 90 days" prepare, "UK government stockpile food" prepper reaction`;

const SCHEMA = {
  type: 'object',
  properties: {
    niche: {
      type: 'string',
      description: 'Target creator niche for this Round, one line.',
    },
    trigger_content: {
      type: 'string',
      description: 'What kind of video counts as trigger content for this Round, one line.',
    },
    queries: {
      type: 'array',
      items: { type: 'string' },
      description: `Between ${MIN_QUERIES} and ${MAX_QUERIES} YouTube search queries.`,
    },
  },
  required: ['niche', 'trigger_content', 'queries'],
  additionalProperties: false,
};

// Limpa as buscas: tira "site:", a palavra "youtube", espaços extras e repetidas.
function cleanQueries(queries) {
  const seen = new Set();
  const out = [];
  for (const raw of queries) {
    const q = String(raw)
      .replace(/site:\S+/gi, '')
      .replace(/\byoutube\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = q.toLowerCase();
    if (q && !seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  }
  return out.slice(0, MAX_QUERIES);
}

async function generateQueries({ theme, redAlert = false, window = null }) {
  const lines = [`Round theme: ${theme}`];
  lines.push(`Round type: ${redAlert ? 'Red Alert (news-driven, recent content only)' : 'regular'}`);
  if (window) lines.push(`Content date window: ${window.from} to ${window.to}`);
  lines.push('Write the search queries.');

  const result = await askJson({
    model: MODELS.sonnet,
    system: SYSTEM,
    prompt: lines.join('\n'),
    schema: SCHEMA,
    effort: 'low',
  });

  const queries = cleanQueries(result.queries || []);
  if (queries.length < MIN_QUERIES) {
    console.warn(`Aviso: o Claude gerou só ${queries.length} buscas (esperado ${MIN_QUERIES} ou mais).`);
  }
  return { niche: result.niche, triggerContent: result.trigger_content, queries };
}

module.exports = { generateQueries, cleanQueries };
