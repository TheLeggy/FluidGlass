import shader from './glass.wgsl?raw';
import { Spring } from './spring';

// html-in-canvas needs a flag and ts also has no types for it
declare global {
  interface HTMLCanvasElement {
    requestPaint(): void;
    updateElementGeometry(element: Element, options: { canvasTransform: DOMMatrixInit }): void; // NOTE: another place to check if something breaks
  }
  interface GPUQueue {
    drawElementImageToTexture( // NOTE: first place to check if something breaks
      source: { source: Element },
      destination: { texture: GPUTexture; premultipliedAlpha: boolean; colorSpace: PredefinedColorSpace },
    ): void;
  }
}

export async function createFluidGlass(content: HTMLElement): Promise<HTMLCanvasElement> {
  const glasses = [...content.querySelectorAll('.glass')];
  if (!glasses.length) throw new Error('No .glass element inside the content');

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%';
  canvas.setAttribute('content', 'drawable');
  content.setAttribute('drawable', '');
  Object.assign(content.style, { width: '100%', height: '100%' }); // inside the canvas nothing else gives it a size
  content.before(canvas);
  canvas.append(content);

  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  const srgbFormat = `${format}-srgb` as GPUTextureFormat; // -srgb views hand the shader linear light
  context.configure({ device, format, viewFormats: [srgbFormat], alphaMode: 'premultiplied' });

  const module = device.createShaderModule({ code: shader });
  const glassPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module },
    fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb' }] },
  });
  const showPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module },
    fragment: { module, entryPoint: 'show', targets: [{ format: srgbFormat }] },
  });

  const glassShapes = device.createBuffer({
    size: glasses.length * 24,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const pageSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    // mirroring at the window edge beats smearing the last row of pixels
    addressModeU: 'mirror-repeat',
    addressModeV: 'mirror-repeat',
  });

  let page: GPUTexture | undefined;
  let pageView: GPUTextureView;
  let below: GPUTexture;
  let readBelow: GPUBindGroup;
  let showPage: GPUBindGroup;

  const presses = glasses.map(() => new Spring(0, 0.26, 0.55));
  glasses.forEach((glass, i) =>
    glass.addEventListener('pointerdown', () => {
      presses[i].target = 1;
      canvas.requestPaint();
    }),
  );
  const release = () => {
    presses.forEach((press) => (press.target = 0));
    canvas.requestPaint();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  let lastPaint = performance.now();

  canvas.addEventListener('paint', () => {
    if (!page) return;

    const now = performance.now();
    presses.forEach((press) => press.step((now - lastPaint) / 1000));
    lastPaint = now;

    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const shapes = glasses.map((glass, i) => {
      const rect = glass.getBoundingClientRect();
      const radius = Math.min(parseFloat(getComputedStyle(glass).borderTopLeftRadius), rect.width / 2, rect.height / 2);
      const grow = presses[i].value * 4;
      const x = rect.x - grow / 2;
      const y = rect.y - grow / 2;
      return [x * scale, y * scale, (rect.width + grow) * scale, (rect.height + grow) * scale, radius * scale, scale];
    });
    device.queue.writeBuffer(glassShapes, 0, new Float32Array(shapes.flat()));

    device.queue.drawElementImageToTexture(
      { source: content },
      { texture: page, premultipliedAlpha: true, colorSpace: 'srgb' },
    );
    canvas.updateElementGeometry(content, { canvasTransform: new DOMMatrix() }); // top left

    const encoder = device.createCommandEncoder();
    for (const [i, [x, y, width, height]] of shapes.entries()) {
      // a pixel of padding each side because the antialiased edge spills half a pixel past the glass
      const left = Math.max(Math.floor(x) - 1, 0);
      const top = Math.max(Math.floor(y) - 1, 0);
      const areaWidth = Math.min(Math.ceil(x + width) + 1, canvas.width) - left;
      const areaHeight = Math.min(Math.ceil(y + height) + 1, canvas.height) - top;
      if (areaWidth <= 0 || areaHeight <= 0) continue;

      const origin = [left, top];
      encoder.copyTextureToTexture({ texture: page, origin }, { texture: below, origin }, [areaWidth, areaHeight]);
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: pageView, loadOp: 'load', storeOp: 'store' }],
      });
      pass.setPipeline(glassPipeline);
      pass.setBindGroup(0, readBelow);
      pass.setScissorRect(left, top, areaWidth, areaHeight);
      pass.draw(3, 1, 0, i);
      pass.end();
    }

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: context.getCurrentTexture().createView({ format: srgbFormat }), loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(showPipeline);
    pass.setBindGroup(0, showPage);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    if (!presses.every((press) => press.resting)) canvas.requestPaint();
  });

  new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize[0]; // not on safari yet
    canvas.width = box.inlineSize;
    canvas.height = box.blockSize;

    page?.destroy();
    below?.destroy();
    page = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'rgba8unorm',
      viewFormats: ['rgba8unorm-srgb'],
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    below = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'rgba8unorm',
      viewFormats: ['rgba8unorm-srgb'],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    pageView = page.createView({ format: 'rgba8unorm-srgb' });
    readBelow = device.createBindGroup({
      layout: glassPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: below.createView({ format: 'rgba8unorm-srgb' }) },
        { binding: 1, resource: { buffer: glassShapes } },
        { binding: 2, resource: pageSampler },
      ],
    });
    showPage = device.createBindGroup({
      layout: showPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: pageView }],
    });
    canvas.requestPaint();
  }).observe(canvas, { box: 'device-pixel-content-box' });

  return canvas;
}
