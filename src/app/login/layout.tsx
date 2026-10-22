import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In to Your Workspace',
  description:
    'Securely sign in to ResearchPilot AI to access your autonomous research workspace, document library, and grounded financial analytics.',
  alternates: {
    canonical: '/login',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
