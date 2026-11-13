import shader from './glass.wgsl?raw';

// html-in-canvas needs a flag and ts also has no types for it
declare global {
  interface HTMLCanvasElement {
    requestPaint(): void;
  }
  interface GPUQueue {
    drawElementImageToTexture( // NOTE: first place to check if something breaks
      source: { source: Element },
      destination: { texture: GPUTexture; premultipliedAlpha: boolean; colorSpace: PredefinedColorSpace },
    ): void;
  }
}

export async function createCanvas(content: HTMLElement): Promise<HTMLCanvasElement> {
  const glass = content.querySelector('.glass');
  if (!glass) throw new Error('No .glass element inside the content');

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
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module },
    fragment: { module, targets: [{ format: srgbFormat }] },
  });

  const glassRect = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  let page: GPUTexture | undefined;
  let bindGroup: GPUBindGroup;

  canvas.addEventListener('paint', () => {
    if (!page) return;

    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const rect = glass.getBoundingClientRect();
    device.queue.writeBuffer(
      glassRect,
      0,
      new Float32Array([rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale]),
    );

    device.queue.drawElementImageToTexture(
      { source: content },
      { texture: page, premultipliedAlpha: true, colorSpace: 'srgb' },
    );

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: context.getCurrentTexture().createView({ format: srgbFormat }), loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  });

  new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize[0]; // not on safari yet
    canvas.width = box.inlineSize;
    canvas.height = box.blockSize;

    page?.destroy();
    page = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'rgba8unorm',
      viewFormats: ['rgba8unorm-srgb'],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: page.createView({ format: 'rgba8unorm-srgb' }) },
        { binding: 1, resource: { buffer: glassRect } },
      ],
    });
    canvas.requestPaint();
  }).observe(canvas, { box: 'device-pixel-content-box' });

  return canvas;
}
