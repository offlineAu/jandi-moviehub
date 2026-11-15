import { AppShell } from '@/components/layout/app-shell';
import { supportUrlFromEnv } from '@/lib/monetization';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppShell supportUrl={supportUrlFromEnv(process.env)}>{children}</AppShell>;
}
