// Carrega o .env e informa quais chaves estão faltando.
// Nunca imprime o valor de nenhuma chave, só o nome.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// Cada chave e a parte do sistema que depende dela.
const KEYS = {
  APIFY_TOKEN: 'busca e coleta no YouTube (Apify)',
  ANTHROPIC_API_KEY: 'geração de buscas, classificação e mensagens (Claude)',
  MONDAY_TOKEN: 'checagem de duplicidade no Monday',
  MONDAY_BOARD_ID: 'checagem de duplicidade no Monday',
  GOOGLE_SERVICE_ACCOUNT_JSON: 'leitura da planilha principal e criação de planilhas',
  MAIN_SHEET_ID: 'checagem de duplicidade na planilha principal',
  OUTPUT_FOLDER_ID: 'pasta das planilhas de saída no Google Drive',
  APP_PASSWORD: 'senha de acesso da interface web',
};

function has(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '';
}

function missingKeys() {
  return Object.keys(KEYS).filter((name) => !has(name));
}

// Mostra no terminal um resumo das chaves: "ok" ou "faltando".
function reportKeys() {
  const missing = missingKeys();
  if (missing.length === 0) {
    console.log('Todas as chaves do .env estão configuradas.');
    return missing;
  }
  console.log('Chaves faltando no .env (o sistema segue funcionando sem estas partes):');
  for (const name of missing) {
    console.log(`  - ${name}: afeta ${KEYS[name]}`);
  }
  return missing;
}

// Para etapas que não funcionam sem a chave: lança um erro claro com o nome dela.
function requireKey(name) {
  if (!has(name)) {
    throw new Error(`Chave ${name} não configurada no .env. Necessária para ${KEYS[name] || 'esta etapa'}.`);
  }
  return process.env[name].trim();
}

module.exports = { KEYS, has, missingKeys, reportKeys, requireKey };

// Permite rodar direto: npm run check-env
if (require.main === module) {
  reportKeys();
}
