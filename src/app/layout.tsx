import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';

const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TrainTrack - Manage Your Bookings',
  description: 'Efficiently manage and track train booking requests.',
  manifest: '/manifest.json', // Added for PWA
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${openSans.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <section id="main" className='max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8'>
            <Providers>{children}</Providers>
          </section>
        </ThemeProvider>
      </body>
    </html>
  );
}
