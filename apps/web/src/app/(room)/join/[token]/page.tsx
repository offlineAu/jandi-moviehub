import type { Metadata } from 'next';
import { JoinInvite } from '@/components/rooms/join-invite';

export const metadata: Metadata = { title: 'You’re invited' };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinInvite token={decodeURIComponent(token)} />;
}
