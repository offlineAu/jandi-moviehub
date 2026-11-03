import { TvDetail } from '@/components/series/tv-metadata';
export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TvDetail id={id} />;
}
