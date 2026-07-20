// HoverTooltip — map overlay extracted verbatim from Creation.jsx.
export default function HoverTooltip({
  hoveredInfo,
}) {
  return (
          <div
            style={{
              position: 'absolute',
              left: hoveredInfo.x + 14,
              top: hoveredInfo.y + 14,
              pointerEvents: 'none',
              backgroundColor: 'white',
              padding: '10px 14px',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              fontSize: '12px',
              zIndex: 1000,
              minWidth: '160px',
              maxWidth: '260px',
              borderLeft: `3px solid ${hoveredInfo.accentColor || '#6B7280'}`,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2, color: '#1f2937' }}>{hoveredInfo.name}</div>
            {hoveredInfo.layerType && (
              <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {hoveredInfo.layerType}
              </div>
            )}
            {hoveredInfo.details && hoveredInfo.details.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {hoveredInfo.details.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ color: '#6b7280' }}>{d.label}</span>
                    <span style={{ fontWeight: 500, color: '#374151', textAlign: 'right' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            {!hoveredInfo.details && hoveredInfo.techs && (
              <div style={{ color: '#4b5563' }}>{hoveredInfo.techs}</div>
            )}
          </div>
  );
}
