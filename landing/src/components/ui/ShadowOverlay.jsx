import { useRef, useEffect } from 'react';

function mapRange(value, fromLow, fromHigh, toLow, toHigh) {
  if (fromLow === fromHigh) return toLow;
  return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
}

let _idCounter = 0;
function nextId() {
  return `shadowoverlay-${++_idCounter}`;
}

/**
 * ShadowOverlay — animated fluid shadow background.
 *
 * Props:
 *   sizing    : 'fill' | 'stretch'
 *   color     : CSS color string
 *   animation : { scale: 1-100, speed: 1-100 }
 *   noise     : { opacity: 0-1, scale: number }
 *   style, className, children
 */
export function ShadowOverlay({
  sizing = 'fill',
  color = 'rgba(128, 128, 128, 1)',
  animation,
  noise,
  style,
  className,
  children,
}) {
  const filterId = useRef(nextId()).current;
  const feColorMatrixRef = useRef(null);
  const rafRef = useRef(null);
  const hueRef = useRef(0);

  const animEnabled = !!(animation && animation.scale > 0);
  const displacementScale = animation ? mapRange(animation.scale, 1, 100, 20, 100) : 0;
  // speed: 1 = very slow (long cycle), 100 = very fast (short cycle)
  const cycleDuration = animation ? mapRange(animation.speed, 1, 100, 40000, 800) : 10000; // ms for 360°

  useEffect(() => {
    if (!animEnabled || !feColorMatrixRef.current) return;

    let lastTime = null;

    function tick(timestamp) {
      if (lastTime === null) lastTime = timestamp;
      const delta = timestamp - lastTime;
      lastTime = timestamp;

      hueRef.current = (hueRef.current + (delta / cycleDuration) * 360) % 360;

      if (feColorMatrixRef.current) {
        feColorMatrixRef.current.setAttribute('values', String(hueRef.current));
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [animEnabled, cycleDuration]);

  const baseFreqX = animation ? mapRange(animation.scale, 0, 100, 0.001, 0.0005) : 0.001;
  const baseFreqY = animation ? mapRange(animation.scale, 0, 100, 0.004, 0.002) : 0.004;

  return (
    <div
      className={className}
      style={{ overflow: 'hidden', position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <div
        style={{
          position: 'absolute',
          inset: animEnabled ? -displacementScale : 0,
          filter: animEnabled ? `url(#${filterId}) blur(4px)` : 'none',
        }}
      >
        {animEnabled && (
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
              <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence
                  result="undulation"
                  numOctaves="2"
                  baseFrequency={`${baseFreqX} ${baseFreqY}`}
                  seed="0"
                  type="turbulence"
                />
                <feColorMatrix
                  ref={feColorMatrixRef}
                  in="undulation"
                  type="hueRotate"
                  values="0"
                />
                <feColorMatrix
                  result="circulation"
                  type="matrix"
                  values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="circulation"
                  scale={displacementScale}
                  result="dist"
                />
                <feDisplacementMap
                  in="dist"
                  in2="undulation"
                  scale={displacementScale}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              </filter>
            </defs>
          </svg>
        )}

        <div
          style={{
            backgroundColor: color,
            maskImage: `url('https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png')`,
            WebkitMaskImage: `url('https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png')`,
            maskSize: sizing === 'stretch' ? '100% 100%' : 'cover',
            WebkitMaskSize: sizing === 'stretch' ? '100% 100%' : 'cover',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      {noise && noise.opacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png")`,
            backgroundSize: `${noise.scale * 200}px`,
            backgroundRepeat: 'repeat',
            opacity: noise.opacity / 2,
            pointerEvents: 'none',
          }}
        />
      )}

      {children && (
        <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%' }}>
          {children}
        </div>
      )}
    </div>
  );
}

