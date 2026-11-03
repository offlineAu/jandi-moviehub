import { SeriesDetail } from '@/components/series/series-views';
export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SeriesDetail id={id} />;
}
