'use client';

import { Toaster as Sonner } from 'sonner';

/** Themed Sonner toaster. Sonner renders an aria-live region for announcements. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      richColors={false}
      offset={{ bottom: 24, right: 24 }}
      mobileOffset={{ bottom: 88 }}
      toastOptions={{
        classNames: {
          toast: 'rounded-xl! border! shadow-2xl! font-sans!',
          description: 'text-muted!',
        },
      }}
      containerAriaLabel="Notifications"
    />
  );
}
