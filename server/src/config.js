import 'dotenv/config';

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 4000),

  // Which text backend to call. gemini and anthropic both work.
  textProvider: (process.env.TEXT_PROVIDER || 'gemini').toLowerCase(),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    // Empty means "whatever server/models.json lists first".
    textModel: process.env.GEMINI_TEXT_MODEL || '',
  },

  // Asked after Gemini when its models are busy, or before it when Settings
  // selects one of the Groq models.
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || '',
  },

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'etsy_listing_generator',
  },
};
