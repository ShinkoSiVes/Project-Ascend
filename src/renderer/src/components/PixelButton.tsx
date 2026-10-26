import type { ButtonHTMLAttributes } from 'react';

type PixelButtonVariant = 'plain' | 'primary' | 'danger';
type PixelButtonSize = 'normal' | 'small';

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
  size?: PixelButtonSize;
}

// A retro button. It defaults to type="button" so it never submits a form by accident.
function PixelButton({
  variant = 'plain',
  size = 'normal',
  className = '',
  ...props
}: PixelButtonProps): React.JSX.Element {
  const sizeClass = size === 'small' ? 'pixel-button--small' : '';

  return (
    <button
      type="button"
      className={`pixel-button pixel-button--${variant} ${sizeClass} ${className}`.trim()}
      {...props}
    />
  );
}

export default PixelButton;
