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
      className={`border border-black/15 bg-surface-container-lowest ${className}`}
    >
      {/* Card Header */}
      {(title || description || headerAction) && (
        <div className="px-6 py-5 flex items-start justify-between border-b border-black/10">
          <div className="flex-1">
            <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-on-surface">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-on-surface-variant">
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
