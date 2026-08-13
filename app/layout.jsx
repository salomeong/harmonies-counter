// The document shell. styles.css is imported here, unchanged from the vanilla app — it is a
// 1,281-line custom-property design system (parchment ground, real component colours, the
// pip/count discipline) and the port deliberately does not touch it. Every class name the React
// components emit is the same class name the string builders used to emit, so the port is meant
// to be visually a no-op.

import "../styles.css";
import { Providers } from "./providers.jsx";

export const metadata = {
  title: "The Faithful Tally",
  description: "A score counter for Harmonies, Faraway and 7 Wonders — tally the board, and the app does the arithmetic.",
  icons: { icon: "/assets/logo.png" }
};

export const viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }){
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
