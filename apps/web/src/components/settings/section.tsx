import * as React from 'react';

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6"
      aria-labelledby={`${title.replace(/\W+/g, '-').toLowerCase()}-title`}
    >
      <h2
        id={`${title.replace(/\W+/g, '-').toLowerCase()}-title`}
        className="font-display text-lg font-semibold"
      >
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SettingRow({
  id,
  label,
  description,
  control,
}: {
  id: string;
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="mt-0.5 text-sm text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}
