import { forwardRef } from 'react';
import type { SVGProps } from 'react';

interface LinkedinIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * lucide-react removeu os ícones de marca (Facebook, Github, Slack, LinkedIn etc.) na v1 por
 * risco de trademark — ver lucide.dev/guide/react/migration. Glifo reproduzido aqui (mesmo
 * path/viewBox do `Linkedin` da v0.546.0) pra manter a aparência idêntica sem depender de um
 * ícone de marca de terceiros embutido na lib.
 */
export const LinkedinIcon = forwardRef<SVGSVGElement, LinkedinIconProps>(
  ({ size = 24, className, ...rest }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
);
LinkedinIcon.displayName = 'LinkedinIcon';
