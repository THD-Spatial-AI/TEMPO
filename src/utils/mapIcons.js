// Location markers live in mapVisuals.createLocationIcon (shared with the Map view).

export const substationIconCache = {};

export const getSubstationIcon = (type) => {
  if (substationIconCache[type]) {
    return substationIconCache[type];
  }

  const colors = {
    transmission: [220, 20, 60],
    distribution: [255, 69, 0],
    converter: [255, 0, 0],
    traction: [178, 34, 34],
    other: [139, 0, 0]
  };

  const color = colors[type] || colors.other;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const rectSize = 50;
  const x = (64 - rectSize) / 2;
  const y = (64 - rectSize) / 2;

  ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.75)`;
  ctx.fillRect(x, y, rectSize, rectSize);

  ctx.strokeStyle = `rgba(${Math.max(0, color[0] - 50)}, ${Math.max(0, color[1] - 20)}, ${Math.max(0, color[2] - 20)}, 0.9)`;
  ctx.lineWidth = 1.5;

  for (let i = -rectSize; i < rectSize * 2; i += 8) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + rectSize, y + rectSize);
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(${Math.max(0, color[0] - 30)}, ${Math.max(0, color[1] - 10)}, ${Math.max(0, color[2] - 10)}, 1)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, rectSize, rectSize);

  const iconData = {
    url: canvas.toDataURL(),
    width: 64,
    height: 64,
    anchorY: 32
  };

  substationIconCache[type] = iconData;
  return iconData;
};
