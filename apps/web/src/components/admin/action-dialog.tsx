'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-field';

/**
 * Confirmation dialog for admin actions. Unlike the shared ConfirmDialog it keeps server errors
 * (e.g. LAST_ADMIN) inline so the reason stays visible next to the action that failed.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  onConfirm,
  pending,
  error,
  destructive = false,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: string | null;
  destructive?: boolean;
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent role={destructive ? 'alertdialog' : 'dialog'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending && !confirmDisabled) onConfirm();
          }}
        >
          {children}
          <FormError message={error} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'primary'}
              loading={pending}
              loadingText={pendingLabel}
              disabled={confirmDisabled}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
