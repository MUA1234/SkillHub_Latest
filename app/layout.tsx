import './globals.css';
import './accessibility.css';
import { Inter, Noto_Sans_Sinhala, Noto_Sans_Tamil, Fraunces, Caveat, Plus_Jakarta_Sans } from 'next/font/google';
import type { Metadata } from 'next';
import AIChatbot from '@/components/ui/ai-chatbot';
import { AdaptiveAccessibilityProvider } from '@/contexts/AdaptiveAccessibilityContext';
import { AccessibilityProvider } from '@/contexts/AccessibilityContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ColorBlindFilters } from '@/components/ColorBlindFilters';
import { PWARegister } from '@/components/PWARegister';
import { ScreenReaderAnnouncer } from '@/components/accessibility/ScreenReaderAnnouncer';
import { SkipLinks } from '@/components/accessibility/SkipLinks';
import { BreakReminder } from '@/components/accessibility/BreakReminder';
import { ReadingRuler, TextMask, FocusHighlight } from '@/components/accessibility/ReadingRuler';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSinhala = Noto_Sans_Sinhala({
  subsets: ['sinhala'],
  variable: '--font-noto-sinhala',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const notoTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  variable: '--font-noto-tamil',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'SkillHub - Learn, Teach, Sponsor',
  description: 'A platform connecting students, educators, and sponsors for skill development',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${notoSinhala.variable} ${notoTamil.variable} ${fraunces.variable} ${caveat.variable} ${jakarta.variable}`}
      suppressHydrationWarning={true}
    >
      <body className={`${jakarta.className} bg-cream-100 text-ink antialiased`} suppressHydrationWarning={true}>
        <LanguageProvider>
          <AccessibilityProvider>
            <AdaptiveAccessibilityProvider>
            <ScreenReaderAnnouncer>
              {}
              <ColorBlindFilters />
              {}
              <PWARegister />

              {}
              <div id="a11y-content-wrapper" className="a11y-content-wrapper">
                {}
                <SkipLinks />

                {}
                <div id="main-content" tabIndex={-1}>
                  {children}
                </div>

                {}
                <AIChatbot />

                {}
                <ReadingRuler />
                <TextMask />
                <FocusHighlight />

                {}
                <BreakReminder />
              </div>

              {}
            </ScreenReaderAnnouncer>
            
            {}
            <Toaster />
          </AdaptiveAccessibilityProvider>
        </AccessibilityProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
