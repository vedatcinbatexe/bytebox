import { Playground } from '@/components/Playground';

export default async function SharedProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Playground slug={slug} />;
}
