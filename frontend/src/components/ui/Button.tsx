import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const sizeClass: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, iconPosition = 'left', className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx('btn', variantClass[variant], sizeClass[size], className)}
      disabled={disabled && loading}
      {...rest}
    >
      {loading ? (
        <Spinner size={14} />
      ) : icon && iconPosition === 'left' ? (
        icon
      ) : null}
      {children}
      {!loading && icon && iconPosition === 'right' ? icon : null}
    </button>
  );
});
