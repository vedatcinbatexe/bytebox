import { EmbedView } from './EmbedView';

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EmbedView slug={slug} />;
}
