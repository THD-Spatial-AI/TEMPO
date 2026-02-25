import React from 'react';

const Badge = ({
  variant = 'light',
  color = 'primary',
  size = 'md',
  startIcon,
  endIcon,
  children,
  className = ''
}) => {
  const baseStyles =
    'inline-flex items-center px-2.5 py-0.5 justify-center gap-1 rounded-full font-medium';

  // Define size styles
  const sizeStyles = {
    sm: 'text-xs',
    md: 'text-sm',
  };

  // Define color styles for variants
  const variants = {
    light: {
      primary: 'bg-gray-50 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
      success: 'bg-gray-50 text-gray-600 dark:bg-gray-500/15 dark:text-gray-500',
      error: 'bg-gray-50 text-gray-600 dark:bg-gray-500/15 dark:text-gray-500',
      warning: 'bg-gray-50 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
      info: 'bg-gray-50 text-gray-600 dark:bg-gray-500/15 dark:text-gray-500',
      light: 'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80',
      dark: 'bg-gray-500 text-white dark:bg-white/5 dark:text-white',
    },
    solid: {
      primary: 'bg-gray-500 text-white',
      success: 'bg-gray-500 text-white',
      error: 'bg-gray-500 text-white',
      warning: 'bg-gray-500 text-white',
      info: 'bg-gray-500 text-white',
      light: 'bg-gray-400 text-white',
      dark: 'bg-gray-700 text-white',
    },
  };

  const sizeClass = sizeStyles[size];
  const colorStyles = variants[variant][color];

  return (
    <span className={`${baseStyles} ${sizeClass} ${colorStyles} ${className}`}>
      {startIcon && <span className="mr-1">{startIcon}</span>}
      {children}
      {endIcon && <span className="ml-1">{endIcon}</span>}
    </span>
  );
};

export default Badge;
