export function canCreateWebGLContext() {
  try {
    const canvas = document.createElement('canvas');
    if (!canvas) return false;

    const attrs = {
      antialias: false,
      alpha: true,
      depth: true,
      stencil: true,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    };

    const gl2 = canvas.getContext('webgl2', attrs);
    if (gl2) return true;

    const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    return !!gl;
  } catch {
    return false;
  }
}

export function webglUnavailableMessage() {
  return 'WebGL is not available on this machine. Update graphics drivers or enable hardware acceleration to use the interactive map.';
}
