import type { Metadata } from 'next';
import './globals.css';
import { AIChat } from '@/components/ai/AIChat';

export const metadata: Metadata = {
  title: 'AI Laser Recruiter',
  description: 'Laser-focused AI recruitment matching system - fast, precise, powerful',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <AIChat />
      </body>
    </html>
  );
}
