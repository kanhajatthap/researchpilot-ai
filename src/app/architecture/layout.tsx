import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Architecture & Technical Blueprint',
  description:
    'Comprehensive architectural specifications of ResearchPilot AI: ReAct agent loop, local HuggingFace all-MiniLM vector embeddings, ChromaDB cosine indexing, AST math sandbox, and zero-cost infrastructure.',
  keywords: [
    'System Architecture',
    'Technical Blueprint',
    'ReAct Agent Architecture',
    'Local RAG Ingestion',
    'ChromaDB Vector Store',
    'Next.js 16 Edge Proxy',
    'Scrypt Cryptography',
  ],
  alternates: {
    canonical: '/architecture',
  },
  openGraph: {
    title: 'System Architecture & Technical Blueprint | ResearchPilot AI',
    description:
      'Detailed micro-to-macro engineering breakdown of ResearchPilot AI: ReAct agent loop, local vector RAG, and zero-cost architecture.',
    url: '/architecture',
  },
};

export default function ArchitectureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
