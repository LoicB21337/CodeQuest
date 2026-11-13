import type { ComponentPropsWithoutRef } from 'react';

type ButtonLinkProps = ComponentPropsWithoutRef<'a'>;

export function ButtonLink({ className = '', ...props }: ButtonLinkProps) {
  return <a className={`button button--primary ${className}`} {...props} />;
}
