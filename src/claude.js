// Cliente do Claude compartilhado: pede respostas em JSON (structured outputs)
// e conta chamadas, tokens e custo estimado de cada execução.

const Anthropic = require('@anthropic-ai/sdk');
const { requireKey } = require('./config');

const MODELS = {
  sonnet: 'claude-sonnet-5-5', // gerar buscas e mensagens
  haiku: 'claude-haiku-5-5',   // classificação em volume
};

// Preço em US$ por milhão de tokens (entrada, saída). Fonte: docs da Anthropic.
const PRICES = {
  'claude-sonnet-5-5': { input: 2.0, output: 10.0 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

const usage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: requireKey('ANTHROPIC_API_KEY') });
  return client;
}

// Faz uma pergunta e devolve o JSON já convertido em objeto.
// schema: JSON Schema que a resposta precisa seguir.
async function askJson({ model, system, prompt, schema, effort = 'low', maxTokens = 4000 }) {
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      effort,
      format: { type: 'json_schema', schema },
    },
  };

  let response;
  try {
    if (model === MODELS.sonnet) {
      // Se o Sonnet recusar por segurança, a API tenta de novo com outro modelo.
      response = await getClient().beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } else {
      response = await getClient().messages.create(params);
    }
  } catch (err) {
    // Erros que se repetiriam em todas as chamadas: param a Round.
    if (err instanceof Anthropic.AuthenticationError) {
      throw Object.assign(new Error('ANTHROPIC_API_KEY inválida. Confira a chave no .env.'), { fatal: true });
    }
    if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.BadRequestError
      || err instanceof Anthropic.NotFoundError) {
      throw Object.assign(new Error(`Erro na API do Claude (${err.status}): ${err.message}`), { fatal: true });
    }
    throw err;
  }

  usage.calls += 1;
  usage.inputTokens += response.usage.input_tokens || 0;
  usage.outputTokens += response.usage.output_tokens || 0;
  const price = PRICES[model];
  if (price) {
    usage.costUsd += ((response.usage.input_tokens || 0) * price.input
      + (response.usage.output_tokens || 0) * price.output) / 1e6;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('O Claude recusou responder a este pedido.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('A resposta do Claude foi cortada (limite de tokens).');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return JSON.parse(text);
}

module.exports = { MODELS, askJson, usage };
