export interface EnvConfig {
  geminiApiKey?: string;
  geminiModel: string;
  nodeEnv: 'development' | 'production' | 'test';
}

export function getServerEnv(): EnvConfig {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    nodeEnv: (process.env.NODE_ENV as EnvConfig['nodeEnv']) || 'development',
  };
}
