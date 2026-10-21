import { JetBrains_Mono } from 'next/font/google';

// The editor font: JetBrains Mono, made for code (clear 0/O and 1/l, ligatures like => and !==)
export const codeFont = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '700'], display: 'swap' });

export const CODE_FONT_FAMILY = `${codeFont.style.fontFamily}, ui-monospace, SFMono-Regular, Menlo, monospace`;
