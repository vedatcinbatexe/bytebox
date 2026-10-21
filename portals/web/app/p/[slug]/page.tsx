import { Playground } from '@/components/Playground';

interface Params {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string }>;
}

export default async function SharedProjectPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { invite } = await searchParams;
  return <Playground slug={slug} invite={invite} />;
}
