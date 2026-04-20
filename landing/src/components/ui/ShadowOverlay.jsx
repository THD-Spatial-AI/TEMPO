import { useRef, useId, useEffect } from 'react';

function mapRange(value, fromLow, fromHigh, toLow, toHigh) {
  if (fromLow === fromHigh) return toLow;
  return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
}

function useInstanceId() {
  const id = useId();
  return 'shadowoverlay-' + id.replace(/:/g, '');
}

/**
 * Filter pipeline (order matters — SVG filters execute top-to-bottom):
 *
 *  feTurbulence          → result="undulation"   (static noise pattern)
 *  feColorMatrix hueRotate in="undulation"
 *                         → result="hue"          (THIS is what we animate — rotates the hue each frame)
 *  feColorMatrix matrix   in="hue"
 *                         → result="circulation"  (amplifies hue channels into a flow map)
 *  feDisplacementMap      in="SourceGraphic" in2="circulation"
 *                         → result="dist"         (warps the coloured blob with flow map)
 *  feDisplacementMap      in="dist" in2="undulation"
 *                         → final output          (adds extra undulation distortion)
 *
 * The hue rotation must feed into the circulation matrix — otherwise animating it has no visual effect.
 */

export function Component({
  sizing = 'fill',
  color = 'rgba(0, 0, 0, 1)',
  animation,
  noise,
  style,
  className,
  children,
}) {
  const id = useInstanceId();
  const animationEnabled = !!(animation && animation.scale > 0);
  const feColorMatrixRef = useRef(null);
  const rafRef = useRef(null);
  const hueRef = useRef(0);
  const lastTimeRef = useRef(null);

  const cycleDuration = animation
    ? mapRange(animation.speed, 1, 100, 40000, 800)
    : 10000;

  const displacementScale = animation
    ? mapRange(animation.scale, 1, 100, 20, 100)
    : 0;

  const baseFreqX = animation
    ? mapRange(animation.scale, 0, 100, 0.001, 0.0005)
    : 0.001;
  const baseFreqY = animation
    ? mapRange(animation.scale, 0, 100, 0.004, 0.002)
    : 0.004;

  useEffect(() => {
    if (!animationEnabled) return;

    function tick(timestamp) {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      hueRef.current = (hueRef.current + (delta / cycleDuration) * 360) % 360;
      const el = feColorMatrixRef.current;
      if (el) el.setAttribute('values', String(hueRef.current));
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    };
  }, [animationEnabled, cycleDuration]);

  return (
    <div
      className={className}
      style={{
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      {/* SVG must be a sibling OUTSIDE the filtered element — browsers resolve url(#id) from document scope */}
      {animationEnabled && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
          aria-hidden="true"
        >
          <defs>
            <filter
              id={id}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              {/* Step 1: generate turbulence noise */}
              <feTurbulence
                result="undulation"
                numOctaves="2"
                baseFrequency={`${baseFreqX} ${baseFreqY}`}
                seed="0"
                type="turbulence"
              />
              {/* Step 2: rotate hue of noise — THIS changes each frame via setAttribute */}
              <feColorMatrix
                ref={feColorMatrixRef}
                in="undulation"
                result="hue"
                type="hueRotate"
                values="0"
              />
              {/* Step 3: amplify hue-rotated channels into a flow map — MUST use result of step 2 */}
              <feColorMatrix
                in="hue"
                result="circulation"
                type="matrix"
                values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"
              />
              {/* Step 4 & 5: displace the source graphic using the flow map */}
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

      {/* The element that has the filter applied */}
      <div
        style={{
          position: 'absolute',
          inset: animationEnabled ? -displacementScale : 0,
          filter: animationEnabled ? `url(#${id}) blur(4px)` : 'none',
        }}
      >
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
            backgroundImage: `url('https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png')`,
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

export { Component as ShadowOverlay };
