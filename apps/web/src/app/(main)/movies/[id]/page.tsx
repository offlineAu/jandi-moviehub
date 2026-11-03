import type { Metadata } from 'next';
import { MovieDetailView } from '@/components/movies/movie-detail-view';
import { apiFetch } from '@/lib/api';
import type { MovieDetail } from '@/lib/types';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const { movie } = await apiFetch<{ movie: MovieDetail }>(`/movies/${encodeURIComponent(id)}`, {
      next: { revalidate: 600 },
    } as RequestInit);
    return {
      title: movie.year ? `${movie.title} (${movie.year})` : movie.title,
      description: movie.overview ?? undefined,
    };
  } catch {
    return { title: 'Movie' };
  }
}

export default async function MoviePage({ params }: Props) {
  const { id } = await params;
  return <MovieDetailView id={id} />;
}
