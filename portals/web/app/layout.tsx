import type { Metadata } from 'next';
import { THEME_SCRIPT } from '@/lib/themeScript';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bytebox',
  description: 'Write, run and share code in the browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by THEME_SCRIPT before React loads, so React must not complain about it
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-app text-fg antialiased">{children}</body>
    </html>
  );
}
