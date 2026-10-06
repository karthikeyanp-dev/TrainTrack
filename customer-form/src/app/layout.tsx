import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Your journey starts here | TrainTrack',
  description: 'Share your train journey and traveller details in a few easy steps. Your booking agent will review your request before booking.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
