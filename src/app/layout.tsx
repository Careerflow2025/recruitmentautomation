import type { Metadata } from 'next';
import './globals.css';
import { AIChat } from '@/components/ai/AIChat';
import { Navbar } from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'AI Matcher Recruiter',
  description: 'AI Matcher Recruiter - fast, precise, powerful recruitment matching system',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16' }
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Navbar />
        {children}
        <AIChat />
      </body>
    </html>
  );
}
