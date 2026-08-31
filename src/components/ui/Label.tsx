import * as React from 'react';
import { cn } from '../../lib/utils';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => {
  return (
    /* Primitivo genérico que repassa `{...props}` (inclusive `htmlFor`, se o chamador passar) ou
       envolve o controle como filho (`<Label><input/></Label>`) — o linter não consegue provar
       estaticamente a associação num spread, mas quem usa este componente é responsável por
       passar `htmlFor`/aninhar o controle, do mesmo jeito que já é cobrado de um <label> nativo. */
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      ref={ref}
      className={cn(
        'text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 block',
        className,
      )}
      {...props}
    />
  );
});
Label.displayName = 'Label';

export { Label };
