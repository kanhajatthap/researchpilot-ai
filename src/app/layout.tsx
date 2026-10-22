import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { APP_CONFIG } from "@/lib/constants";
import { AuthProvider } from "@/lib/auth/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://researchpilot-ai.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "ResearchPilot AI — Autonomous Enterprise AI Research & Financial RAG Platform",
    template: `%s | ${APP_CONFIG.name}`,
  },
  description:
    "Enterprise-grade Autonomous Financial & Academic Research Agent powered by an intelligent ReAct reasoning loop, local HuggingFace embeddings, and ChromaDB vector search with 100% page-grounded citations.",
  applicationName: APP_CONFIG.name,
  keywords: [
    "AI Research Assistant",
    "Autonomous Agent",
    "ReAct Loop",
    "Financial Analysis AI",
    "Form 10-K RAG",
    "Document Intelligence",
    "ChromaDB",
    "HuggingFace Transformers",
    "Next.js 16",
    "B2B AI SaaS",
    "Page-level Citations",
    "Zero-Cost AI Architecture",
  ],
  authors: [{ name: "ResearchPilot AI Team", url: "https://github.com/kanhajatthap/researchpilot-ai" }],
  creator: "ResearchPilot AI",
  publisher: "ResearchPilot AI",
  category: "Business & Financial Intelligence",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: APP_CONFIG.name,
    title: "ResearchPilot AI — Autonomous Financial & Academic Research Agent",
    description:
      "Enterprise AI SaaS platform with ReAct agentic reasoning, local vector RAG, and audit-ready page citations for financial and academic documents.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ResearchPilot AI — Autonomous Financial & Academic Research Agent",
    description:
      "Enterprise AI SaaS platform with ReAct agentic reasoning, local vector RAG, and audit-ready page citations.",
    creator: "@researchpilot",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/**
 * Runs before first paint so the correct theme class is on <html> straight
 * away. Without this the app would flash the wrong theme on load.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem('rp-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(t);e.style.colorScheme=t;}catch(e){}})();`;

const jsonLdSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ResearchPilot AI",
  url: BASE_URL,
  description:
    "Enterprise Autonomous Financial & Academic Research Agent with 100% page-grounded citations and ReAct reasoning loop.",
  applicationCategory: "BusinessApplication, FinanceApplication",
  operatingSystem: "All",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Autonomous ReAct Reasoning Loop",
    "Local HuggingFace Vector Embeddings (all-MiniLM-L6-v2)",
    "ChromaDB Vector Store with Cosine Metric",
    "Deterministic AST Math Evaluator",
    "Strict Page-by-Page Source Citations",
    "Zero-Cost Cloud Infrastructure",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
