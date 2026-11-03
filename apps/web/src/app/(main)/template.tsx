import { PageTransition } from '@/components/motion/view-transition';

export default function MainTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
