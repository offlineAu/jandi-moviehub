import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

/*
 * Buttons are fully round, decided once. Primary is a glossy brand gradient that slides on hover
 * with a light sweep; secondary/outline are dark glass with a gradient rim; overlay is frosted
 * glass for use over artwork. Every button gives on press.
 */
export const buttonVariants = cva(
  'relative isolate inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background-color,background-position,color,box-shadow,transform,opacity,border-color] duration-300 ease-[var(--ease-expo)] active:scale-[0.96] active:duration-100 focus-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-[var(--ease-expo)] hover:[&_svg]:scale-110',
  {
    variants: {
      variant: {
        primary:
          'sheen text-white bg-[linear-gradient(110deg,#7c3aed_0%,#a21caf_35%,#db2777_65%,#f43f5e_85%,#fb7185_100%)] bg-[length:220%_100%] bg-[position:0%_50%] shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.25),0_10px_28px_-10px_rgb(219_39_119/0.65)] hover:-translate-y-0.5 hover:bg-[position:100%_50%] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.32),inset_0_-1px_0_rgb(0_0_0/0.25),0_18px_40px_-12px_rgb(219_39_119/0.8),0_0_0_4px_rgb(236_72_153/0.12)]',
        secondary:
          'border border-transparent text-foreground [background:linear-gradient(#1d1d2c,#1d1d2c)_padding-box,linear-gradient(135deg,rgb(255_255_255/0.22),rgb(255_255_255/0.05)_45%,rgb(168_85_247/0.35))_border-box] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_8px_24px_-14px_rgb(0_0_0/0.9)] hover:-translate-y-0.5 hover:[background:linear-gradient(#262638,#262638)_padding-box,linear-gradient(135deg,rgb(255_255_255/0.3),rgb(168_85_247/0.55)_55%,rgb(236_72_153/0.65))_border-box] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_14px_30px_-14px_rgb(168_85_247/0.5)]',
        ghost: 'text-foreground/85 hover:bg-white/[0.07] hover:text-foreground',
        outline:
          'border border-transparent text-foreground [background:linear-gradient(#0c0c16,#0c0c16)_padding-box,linear-gradient(135deg,rgb(255_255_255/0.2),rgb(255_255_255/0.06))_border-box] hover:-translate-y-0.5 hover:[background:linear-gradient(#160f24,#160f24)_padding-box,linear-gradient(135deg,var(--primary),var(--accent))_border-box] hover:shadow-[0_12px_30px_-14px_rgb(236_72_153/0.6)]',
        destructive:
          'text-white bg-[linear-gradient(110deg,#b91c1c,#dc2626_50%,#f43f5e)] shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_24px_-12px_rgb(220_38_38/0.7)] hover:-translate-y-0.5 hover:brightness-110',
        link: 'link-fx rounded-none px-0! h-auto! active:scale-100',
        overlay:
          'text-white bg-white/[0.09] backdrop-blur-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.2),inset_0_0_0_1px_rgb(255_255_255/0.14),0_10px_30px_-14px_rgb(0_0_0/0.8)] hover:-translate-y-0.5 hover:bg-white/[0.16] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_0_0_1px_rgb(255_255_255/0.24),0_14px_34px_-14px_rgb(0_0_0/0.9)]',
      },
      size: {
        sm: 'h-8 px-3.5 text-[13px] [&_svg]:size-3.5',
        md: 'h-10 px-5 text-sm [&_svg]:size-4',
        lg: 'h-12 px-7 text-[15px] font-semibold [&_svg]:size-[18px]',
        icon: 'size-10 [&_svg]:size-5',
        'icon-sm': 'size-8 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) {
      return (
        <Slot.Root ref={ref} className={classes} {...props}>
          {children}
        </Slot.Root>
      );
    }
    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        type={props.type ?? 'button'}
        {...props}
      >
        {loading ? (
          <>
            <Spinner className="size-4" label={loadingText ?? 'Loading'} />
            {loadingText ?? children}
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';
