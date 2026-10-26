import type { ButtonHTMLAttributes } from 'react';

type PixelButtonVariant = 'plain' | 'primary' | 'danger';

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
}

// A retro button. It defaults to type="button" so it never submits a form by accident.
function PixelButton({
  variant = 'plain',
  className = '',
  ...props
}: PixelButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`pixel-button pixel-button--${variant} ${className}`.trim()}
      {...props}
    />
  );
}

export default PixelButton;
