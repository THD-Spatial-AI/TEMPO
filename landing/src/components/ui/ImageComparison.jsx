import { useState, useRef, useCallback, useEffect } from 'react'

export const ImageComparison = ({
  beforeImage,
  afterImage,
  altBefore = 'Before',
  altAfter = 'After',
}) => {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef(null)

  const handleMove = useCallback(
    (clientX) => {
      if (!isDragging || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let newPosition = ((clientX - rect.left) / rect.width) * 100
      newPosition = Math.max(0, Math.min(100, newPosition))
      setSliderPosition(newPosition)
    },
    [isDragging],
  )

  const handleMouseDown = () => setIsDragging(true)
  const handleMouseUp = () => setIsDragging(false)
  const handleMouseMove = (e) => handleMove(e.clientX)
  const handleTouchStart = () => setIsDragging(true)
  const handleTouchEnd = () => setIsDragging(false)
  const handleTouchMove = (e) => handleMove(e.touches[0].clientX)

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden border border-neutral-200"
      style={{ height: '480px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Before image — base layer (bottom) */}
      <img
        src={afterImage}
        alt={altAfter}
        className="absolute inset-0 h-full w-full object-cover object-left-top"
        draggable="false"
      />

      {/* Before label */}
      <div className="absolute top-4 right-4 bg-white text-black border border-neutral-200 px-3 py-1 font-black uppercase text-[9px] tracking-widest pointer-events-none z-10">
        {altAfter}
      </div>

      {/* After image — clipped on the left (top) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img
          src={beforeImage}
          alt={altBefore}
          className="h-full w-full object-cover object-left-top"
          draggable="false"
        />
        {/* After label */}
        <div className="absolute top-4 left-4 bg-black text-white px-3 py-1 font-black uppercase text-[9px] tracking-widest pointer-events-none">
          {altBefore}
        </div>
      </div>

      {/* Slider line + handle */}
      <div
        className="absolute inset-y-0 w-[2px] bg-white cursor-ew-resize flex items-center justify-center"
        style={{ left: `calc(${sliderPosition}% - 1px)` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div
          className={`bg-white h-12 w-12 flex items-center justify-center shadow-lg transition-transform duration-150 ${
            isDragging ? 'scale-110' : ''
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
            className="text-black"
          >
            <polyline points="15 18 9 12 15 6" />
            <polyline points="9 18 3 12 9 6" transform="scale(-1,1) translate(-24,0)" />
          </svg>
        </div>
      </div>
    </div>
  )
}
