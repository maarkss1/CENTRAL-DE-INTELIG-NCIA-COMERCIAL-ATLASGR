import { forwardRef } from 'react';
import type { SVGProps } from 'react';

interface YoutubeIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * lucide-react removeu os ícones de marca (Facebook, Github, Slack, LinkedIn, Youtube etc.) na v1
 * por risco de trademark — ver lucide.dev/guide/react/migration. Mesmo caso já resolvido para
 * LinkedIn/GitHub (ver LinkedinIcon.tsx/GithubIcon.tsx nesta pasta) — glifo reproduzido aqui
 * (mesmo path/viewBox do `Youtube` da v0.546.0) pra manter a aparência idêntica sem depender de
 * um ícone de marca de terceiros embutido na lib.
 */
export const YoutubeIcon = forwardRef<SVGSVGElement, YoutubeIconProps>(
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
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  ),
);
YoutubeIcon.displayName = 'YoutubeIcon';
