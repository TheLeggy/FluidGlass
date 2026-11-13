struct Rect {
  position: vec2f,
  size: vec2f,
}

@group(0) @binding(0) var page: texture_2d<f32>;
@group(0) @binding(1) var<uniform> glass: Rect;

const sigma = 6.0;
const radius = 18; // past 3 sigma the weights are too small to see

fn blur(center: vec2i) -> vec4f {
  let last = vec2i(textureDimensions(page)) - 1;
  var sum = vec4f(0);
  var total = 0.0;
  for (var y = -radius; y <= radius; y++) {
    for (var x = -radius; x <= radius; x++) {
      let weight = exp(-f32(x * x + y * y) / (2 * sigma * sigma));
      sum += weight * textureLoad(page, clamp(center + vec2i(x, y), vec2i(0), last), 0);
      total += weight;
    }
  }
  return sum / total;
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
