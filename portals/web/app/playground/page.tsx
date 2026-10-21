import type { Metadata } from 'next';
import { Playground } from '@/components/Playground';

export const metadata: Metadata = { title: 'Playground · Bytebox' };

// Your local workspace (saved in this browser until you share it)
export default function PlaygroundPage() {
  return <Playground />;
}
