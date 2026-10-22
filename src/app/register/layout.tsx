import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Your Free Account',
  description:
    'Register for a free ResearchPilot AI account to start analyzing financial reports, Form 10-Ks, and academic papers with 100% page citations.',
  alternates: {
    canonical: '/register',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
