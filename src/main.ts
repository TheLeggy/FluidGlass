const canvas = document.querySelector('canvas')!;

new ResizeObserver(([entry]) => {
  const box = entry.devicePixelContentBoxSize[0]; // not on safari yet
  canvas.width = box.inlineSize;
  canvas.height = box.blockSize;
}).observe(canvas, { box: 'device-pixel-content-box' });
