import { PageTransition } from '@/components/motion/view-transition';

export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
