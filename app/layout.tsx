import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'F1 H2H Engine',
  description: 'Dynamic Broadcast Graphics Engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-white antialiased">
        {/* Mobile WebKit Font Rasterisation Preloader */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-9999px',
            left: '-9999px',
            width: '1px',
            height: '1px',
            opacity: 0.01,
            pointerEvents: 'none',
            overflow: 'hidden',
            userSelect: 'none',
          }}
        >
          <span style={{ fontFamily: "'Tomorrow', sans-serif", fontWeight: 700, fontStyle: 'italic' }}>
            TALE OF THE TAPE
          </span>
          <span style={{ fontFamily: "'Tomorrow-BoldItalic', sans-serif" }}>
            TALE OF THE TAPE
          </span>
          <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 400 }}>
            ROUND 12
          </span>
          <span style={{ fontFamily: "'OxaniumRoman-Regular', sans-serif" }}>
            ROUND 12
          </span>
          <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 600 }}>
            A. Antonelli M. Verstappen
          </span>
          <span style={{ fontFamily: "'OxaniumRoman-SemiBold', sans-serif" }}>
            A. Antonelli M. Verstappen
          </span>
          <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 800 }}>
            0123456789
          </span>
          <span style={{ fontFamily: "'OxaniumRoman-ExtraBold', sans-serif" }}>
            0123456789
          </span>
        </div>

        {children}
      </body>
    </html>
  );
}