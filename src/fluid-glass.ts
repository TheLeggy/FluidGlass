export function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%';
  document.body.append(canvas);

  new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize[0]; // not on safari yet
    canvas.width = box.inlineSize;
    canvas.height = box.blockSize;
  }).observe(canvas, { box: 'device-pixel-content-box' });

  return canvas;
}
