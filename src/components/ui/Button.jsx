import React from 'react';

const Button = ({
  children,
  size = 'md',
  variant = 'primary',
  startIcon,
  endIcon,
  onClick,
  className = '',
  disabled = false,
  type = 'button'
}) => {
  // Size Classes
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-3 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };

  // Variant Classes
  const variantClasses = {
    primary:
      'bg-primary text-white hover:opacity-80 disabled:bg-outline-variant disabled:cursor-not-allowed',
    secondary:
      'bg-primary text-white hover:opacity-80 disabled:bg-outline-variant disabled:cursor-not-allowed',
    outline:
      'bg-transparent text-black border border-black hover:bg-black hover:text-white disabled:border-outline-variant disabled:text-outline disabled:cursor-not-allowed',
    success:
      'bg-primary text-white hover:opacity-80 disabled:bg-outline-variant disabled:cursor-not-allowed',
    danger:
      'bg-error text-white hover:opacity-80 disabled:bg-outline-variant disabled:cursor-not-allowed',
    ghost:
      'bg-transparent text-black/60 hover:text-black hover:bg-surface-container-low disabled:text-outline disabled:cursor-not-allowed',
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${disabled ? 'opacity-60' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
