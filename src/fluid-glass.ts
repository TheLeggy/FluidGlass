// html-in-canvas needs a flag and ts also has no types for it
declare global {
  interface HTMLCanvasElement {
    requestPaint(): void;
  }
  interface CanvasRenderingContext2D {
    drawElementImage(element: Element, x: number, y: number): void;
  }
}

export function createCanvas(content: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%';
  canvas.setAttribute('content', 'drawable');
  content.setAttribute('drawable', '');
  Object.assign(content.style, { width: '100%', height: '100%' }); // without this the element shrinks to fit its children
  content.before(canvas);
  canvas.append(content);

  const context = canvas.getContext('2d')!;
  canvas.addEventListener('paint', () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawElementImage(content, 0, 0);
  });

  new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize[0]; // not on safari yet
    canvas.width = box.inlineSize;
    canvas.height = box.blockSize;
    canvas.requestPaint();
  }).observe(canvas, { box: 'device-pixel-content-box' });

  return canvas;
}
