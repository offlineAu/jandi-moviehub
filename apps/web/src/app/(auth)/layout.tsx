import { Logo } from '@/components/layout/logo';
import { IrisField } from '@/components/motion/iris-field';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="film-grain relative flex min-h-dvh flex-col overflow-hidden">
      <IrisField className="-z-10" intensity={0.9} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_50%,rgb(8_8_16/0.55),transparent_80%)]"
      />
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 outline-none sm:items-center sm:pt-0"
      >
        {children}
      </main>
    </div>
  );
}
