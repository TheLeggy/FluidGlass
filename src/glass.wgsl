struct Rect {
  position: vec2f,
  size: vec2f,
}

@group(0) @binding(0) var page: texture_2d<f32>;
@group(0) @binding(1) var<uniform> glass: Rect;

const radius = 10;

fn blur(center: vec2i) -> vec4f {
  let last = vec2i(textureDimensions(page)) - 1;
  var sum = vec4f(0);
  for (var y = -radius; y <= radius; y++) {
    for (var x = -radius; x <= radius; x++) {
      sum += textureLoad(page, clamp(center + vec2i(x, y), vec2i(0), last), 0);
    }
  }
  let side = f32(2 * radius + 1);
  return sum / (side * side);
}

// one oversized triangle covers the whole screen
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((i << 1) & 2), f32(i & 2));
  return vec4f(corner * 2 - 1, 0, 1);
}

@fragment
fn fs(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let center = vec2i(pixel.xy);
  let inside = all(pixel.xy >= glass.position) && all(pixel.xy < glass.position + glass.size);
  if (!inside) {
    return textureLoad(page, center, 0);
  }

  let white = 0.4;
  return blur(center) * (1 - white) + white;
}
