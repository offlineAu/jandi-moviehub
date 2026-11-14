import { AnimeWatch } from '@/components/anime/anime-watch';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnimeWatch id={id} />;
}
