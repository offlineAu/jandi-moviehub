import type { Metadata } from 'next';
import { ProfileView } from '@/components/profile/profile-view';

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)}` };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  return <ProfileView username={decodeURIComponent(username)} />;
}
