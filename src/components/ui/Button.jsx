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
      'bg-gray-600 text-white shadow-sm hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
    secondary:
      'bg-gray-600 text-white shadow-sm hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
    outline:
      'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-gray-700',
    success:
      'bg-gray-600 text-white shadow-sm hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
    danger:
      'bg-gray-600 text-white shadow-sm hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
    ghost:
      'bg-transparent text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-800',
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 ${className} ${
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
