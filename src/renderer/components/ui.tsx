import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export function Button({
  children,
  className,
  variant = 'filled',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'filled' | 'tonal' | 'text' }) {
  return (
    <button
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'filled' && 'bg-md-primary text-md-onPrimary shadow-sm hover:brightness-95',
        variant === 'tonal' && 'bg-md-surfaceContainerHigh text-md-text hover:bg-md-surfaceContainer',
        variant === 'text' && 'text-md-primary hover:bg-md-surfaceContainer',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        'inline-flex h-10 w-10 items-center justify-center rounded-full bg-md-surfaceContainerHigh text-md-text transition hover:bg-md-surfaceContainer disabled:cursor-not-allowed disabled:opacity-50',
        '[&>svg]:h-5 [&>svg]:w-5',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-md-muted">
      <Icon size={15} />
      <span>{title}</span>
    </div>
  );
}

