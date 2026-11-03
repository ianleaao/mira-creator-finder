// Mensagens do Bryce para os creators Approved (Fase 6), seguindo o roteiro do Ian.
// O texto é escrito pelo Claude na sessão (messages.json); aqui ficam:
//  - pistas do nome real (só frases explícitas, nunca o e-mail);
//  - a ideia de colaboração sugerida pelo tipo de creator;
//  - a revisão obrigatória antes de salvar (passo 9 do roteiro);
//  - o resumo messages-brief.md com o que é preciso para escrever.

const CALENDLY = 'https://calendly.com/bryce-g-mirasafety/30min';

// Fechamentos em rotação (passo 8). {CAL} = link do Calendly.
const CLOSINGS = [
  'Would you be interested in collaborating with us? If so, feel free to grab a time for a quick chat here: {CAL}',
  'Would you be open to working together? If it sounds good, you can grab a time for a quick call here: {CAL}',
  "Is this something you'd be interested in? If so, feel free to book a quick chat here: {CAL}",
];

// Frases que entregam o nome: "I'm Ben", "my name is Lilly", "Jara's group".
const NAME_PATTERNS = [
  // A frase pode começar com maiúscula ou não; o nome precisa começar com maiúscula.
  /\b(?:[Ii]['’]m|[Ii] am)\s+([A-Z][a-z]{1,15})\b/g,
  /\b[Mm]y name is\s+([A-Z][a-z]{1,15})\b/g,
  /\b(?:[Tt]his is)\s+([A-Z][a-z]{1,15})\b/g,
  /\b([A-Z][a-z]{1,15})['’]s\s+(?:group|channel|homestead|kitchen|family)\b/g,
  /\b[Ww]e(?:['’]re| are)\s+([A-Z][a-z]{1,15})\s+(?:and|&)\s+([A-Z][a-z]{1,15})\b/g,
];

// Palavras que parecem nome mas não são.
const NOT_NAMES = new Set(['a', 'an', 'the', 'so', 'not', 'just', 'here', 'back', 'going', 'sharing', 'welcome', 'excited', 'happy', 'from', 'in', 'on', 'currently', 'also', 'really', 'still', 'always', 'never', 'very', 'your', 'our', 'this', 'that', 'it', 'its', 'youtube', 'mama', 'mom', 'dad']);

// Pistas de nome com o trecho onde apareceram. Quem decide se está confirmado é o Claude.
function nameHints(texts) {
  const hints = [];
  for (const { source, text } of texts) {
    for (const re of NAME_PATTERNS) {
      for (const m of String(text || '').matchAll(re)) {
        for (const name of m.slice(1).filter(Boolean)) {
          if (NOT_NAMES.has(name.toLowerCase())) continue;
          const start = Math.max(0, m.index - 40);
          const snippet = String(text).slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ').trim();
          if (!hints.some((h) => h.name === name)) hints.push({ name, source, snippet });
        }
      }
    }
  }
  return hints;
}

// Tipo de creator para as ideias de colaboração (passo 6), pelo nicho e títulos.
function ideaCategory(creator) {
  const text = `${creator.niche} ${creator.evidence.channel_description} ${creator.evidence.recent_titles.join(' ')}`.toLowerCase();
  if (/\b(review|tested|testing|gear|unboxing)\b/.test(text)) return 'review';
  if (/\b(live|livestream|news|update|breaking)\b/.test(text)) return 'live';
  if (/\b(family|homestead|homesteading|mama|mom|kids|farm)\b/.test(text)) return 'family';
  return 'family';
}

const IDEAS = {
  review: 'um review prático da máscara',
  family: 'a máscara no kit de emergência da família',
  live: 'um segmento sobre o que fazer, ou mandar uma máscara para ele testar',
  social: 'um unboxing ou um "o que tem no meu kit"',
};

// Revisão do passo 9. Devolve a lista de problemas (vazia se ok).
function reviewMessage(message, type = 'email') {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const problems = [];
  const dashes = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);
  if (dashes.test(text)) problems.push('tem travessão');
  if (/gas masks?/.test(lower) && /respirators?/.test(lower)) problems.push('usa "gas masks" e "respirators" juntos (use só um)');
  if (/\b(sponsor|sponsored|sponsorship|paid|payment|compensat)/.test(lower)) problems.push('fala de patrocínio ou pagamento');
  if (!text.includes(CALENDLY)) problems.push('falta o link do Calendly');
  if (type === 'email') {
    if (!/^Subject: Potential Collaboration with MIRA Safety/.test(text)) problems.push('falta o Subject do modelo de e-mail');
    if (!/\n\s*Talk soon,\s*\n\s*Bryce\s*$/.test(text)) problems.push('não termina com "Talk soon, Bryce"');
    const closingOk = CLOSINGS.some((c) => text.includes(c.replace('{CAL}', CALENDLY)));
    if (!closingOk) problems.push('o fechamento não é um dos 3 do roteiro');
  } else if (!/Bryce/.test(text)) {
    problems.push('não está assinada pelo Bryce');
  }
  return problems;
}

// Qual dos 3 fechamentos a mensagem usa (0, 1, 2) ou -1.
function closingIndex(message) {
  return CLOSINGS.findIndex((c) => String(message || '').includes(c.replace('{CAL}', CALENDLY)));
}

// Resumo para escrever as mensagens dos Approved que ainda não têm mensagem.
function buildMessageBrief(info, creators, existing = {}) {
  const approved = creators.filter((c) => c.status === 'Approved');
  const used = Object.values(existing).map((m) => closingIndex(m.message)).filter((i) => i >= 0);
  const nextClosing = used.length ? (used[used.length - 1] + 1) % CLOSINGS.length : 0;
  const lines = [`# Mensagens: ${info.theme}`, ''];
  lines.push('Roteiro no CLAUDE.md (Fase 6). Por enquanto, sempre o modelo de e-mail.');
  lines.push(`Próximo fechamento da rotação: ${nextClosing + 1}`);
  lines.push('');
  for (const c of approved) {
    const id = c.platforms.youtube.channel_id;
    if (existing[id]) {
      lines.push(`## ${c.name} (já tem mensagem)`, '');
      continue;
    }
    const texts = [
      { source: 'descrição do canal', text: c.evidence.channel_description },
      ...(c.evidence.recent_descriptions || []).map((d, i) => ({ source: `descrição do vídeo ${i + 1}`, text: d })),
    ];
    const hints = nameHints(texts);
    lines.push(`## ${c.name}`);
    lines.push(`- id: \`${id}\` | ${c.platforms.youtube.url}`);
    lines.push(`- Contato: ${c.contact.email ? `e-mail ${c.contact.email}` : 'sem e-mail'}${c.platforms.instagram.url ? ` | Instagram ${c.platforms.instagram.url}` : ''}${c.platforms.tiktok.url ? ` | TikTok ${c.platforms.tiktok.url}` : ''}`);
    lines.push(`- Nicho: ${c.niche}`);
    lines.push(`- Vídeo do tema: ${c.trigger_content ? `"${c.trigger_content.title}" (${c.trigger_content.date})` : 'nenhum'}`);
    lines.push(`- Ideia sugerida pelo tipo (${ideaCategory(c)}): ${IDEAS[ideaCategory(c)]}`);
    if (hints.length) {
      lines.push('- Pistas de nome (confirmar no trecho; nunca usar o e-mail):');
      for (const h of hints) lines.push(`  - ${h.name} (${h.source}): "...${h.snippet}..."`);
    } else {
      lines.push('- Pistas de nome: nenhuma. Usar o nome do canal.');
    }
    if (!(c.evidence.recent_descriptions || []).length) lines.push('- Descrições dos vídeos: não coletadas nesta Round.');
    lines.push(`- Títulos recentes: ${c.evidence.recent_titles.slice(0, 8).join(' | ')}`);
    lines.push('');
  }
  if (!approved.length) lines.push('Nenhum creator Approved.');
  return { markdown: lines.join('\n'), approved: approved.length };
}

module.exports = { CALENDLY, CLOSINGS, nameHints, ideaCategory, reviewMessage, closingIndex, buildMessageBrief };
