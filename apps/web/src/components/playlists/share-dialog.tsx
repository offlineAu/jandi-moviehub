'use client';

import { Check, Copy, Link2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useUpdatePlaylist, type Playlist } from '@/lib/queries/playlists';
import { cn } from '@/lib/utils';
import { VISIBILITY_ICON } from './playlist-card';
import { VISIBILITY_COPY } from './playlist-utils';

export function ShareDialog({
  playlist,
  open,
  onOpenChange,
}: {
  playlist: Playlist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdatePlaylist(playlist.id);
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const url =
    typeof window === 'undefined'
      ? playlist.sharePath
      : new URL(playlist.sharePath, window.location.origin).toString();
  const Icon = VISIBILITY_ICON[playlist.visibility];
  const isPrivate = playlist.visibility === 'PRIVATE';

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
    } catch {
      inputRef.current?.select();
      toast.error('Couldn’t copy automatically — the link is selected, copy it manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share playlist</DialogTitle>
          <DialogDescription>
            Send the link to friends so they can see the lineup.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <label htmlFor="playlist-share-url" className="sr-only">
            Playlist link
          </label>
          <Input
            ref={inputRef}
            id="playlist-share-url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button onClick={() => void copy()} className="h-11" aria-label="Copy link">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
        <div
          className={cn(
            'flex gap-3 rounded-[10px] border px-3.5 py-3 text-sm',
            isPrivate
              ? 'border-warning/30 bg-warning/[0.08] text-[#fde68a]'
              : 'border-border-strong bg-secondary/60 text-foreground/90',
          )}
        >
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="grid gap-2">
            <p>{VISIBILITY_COPY[playlist.visibility].share}</p>
            {isPrivate && playlist.isOwner ? (
              <Button
                size="sm"
                variant="secondary"
                className="w-fit"
                loading={update.isPending}
                loadingText="Updating"
                onClick={() =>
                  update.mutate(
                    { visibility: 'UNLISTED' },
                    {
                      onSuccess: () => toast.success('Anyone with the link can now view it'),
                      onError: (error) =>
                        toast.error(errorMessage(error, 'Couldn’t change visibility.')),
                    },
                  )
                }
              >
                <Link2 aria-hidden="true" />
                Make it unlisted
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
