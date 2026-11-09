import { notFound } from 'next/navigation';
import { EmbedControlsTest } from '@/components/watch/embed-controls-test';
export default function EmbedControlsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <EmbedControlsTest />;
}
