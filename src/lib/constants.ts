export interface AppConfig {
  name: string;
  description: string;
  tagline: string;
  version: string;
  /** Author / builder credited throughout the UI and metadata. */
  author: string;
  authorUrl: string;
}

export const APP_CONFIG: AppConfig = {
  name: 'ResearchPilot AI',
  description: 'An Agentic AI Research Assistant powered by RAG, LangChain & LangGraph',
  tagline: 'An Agentic AI Research Assistant powered by RAG, LangChain & LangGraph',
  version: '0.1.0',
  author: 'Kanha Jatthap',
  authorUrl: 'https://github.com/kanhajatthap',
};
