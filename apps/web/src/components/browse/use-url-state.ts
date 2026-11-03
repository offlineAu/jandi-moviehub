'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

/** Read/write URL search params (replace, no scroll jump). Empty values are removed. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = React.useCallback(
    (
      updates: Record<string, string | number | boolean | null | undefined>,
      options: { resetPage?: boolean; scroll?: boolean } = {},
    ) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === '' || value === false)
          next.delete(key);
        else next.set(key, String(value));
      }
      if (options.resetPage !== false && !('page' in updates)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: options.scroll ?? false });
    },
    [params, pathname, router],
  );

  return { params, set };
}
