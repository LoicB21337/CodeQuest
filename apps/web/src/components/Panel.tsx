import type { ComponentPropsWithoutRef } from 'react';

type PanelProps = ComponentPropsWithoutRef<'section'>;

export function Panel({ className = '', ...props }: PanelProps) {
  return <section className={`panel ${className}`} {...props} />;
}
