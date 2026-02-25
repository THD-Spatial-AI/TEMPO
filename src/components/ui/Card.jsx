import React from 'react';

const Card = ({
  title,
  children,
  className = '',
  description = '',
  headerAction = null,
  noPadding = false
}) => {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}
    >
      {/* Card Header */}
      {(title || description || headerAction) && (
        <div className="px-6 py-5 flex items-start justify-between border-b border-gray-100">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
          {headerAction && (
            <div className="ml-4 flex-shrink-0">
              {headerAction}
            </div>
          )}
        </div>
      )}

      {/* Card Body */}
      <div className={noPadding ? '' : 'p-6'}>
        {children}
      </div>
    </div>
  );
};

export default Card;
