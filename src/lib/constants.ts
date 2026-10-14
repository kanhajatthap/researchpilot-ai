export interface AppConfig {
  name: string;
  description: string;
  tagline: string;
  version: string;
}

export const APP_CONFIG: AppConfig = {
  name: 'ResearchPilot AI',
  description: 'An Agentic AI Research Assistant powered by RAG, LangChain & LangGraph',
  tagline: 'An Agentic AI Research Assistant powered by RAG, LangChain & LangGraph',
  version: '0.1.0',
};
