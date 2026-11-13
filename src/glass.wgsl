struct Glass {
  position: vec2f,
  size: vec2f,
  radius: f32,
}

@group(0) @binding(0) var page: texture_2d<f32>;
@group(0) @binding(1) var<uniform> glass: Glass;

const sigma = 6.0;
const radius = 18; // past 3 sigma the weights are too small to see
const bevel = 60.0;

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

// distance to the edge, negative inside
fn roundedBox(p: vec2f, halfSize: vec2f, r: f32) -> f32 {
  let q = abs(p) - halfSize + r;
  return length(max(q, vec2f(0))) + min(max(q.x, q.y), 0) - r;
}

// TODO: creases can start appearing once the bevel is wider than the corners
fn outward(p: vec2f, halfSize: vec2f, r: f32) -> vec2f {
  let q = abs(p) - halfSize + r;
  var n = select(vec2f(0, 1), vec2f(1, 0), q.x > q.y);
  if (all(q > vec2f(0))) {
    n = normalize(q);
  }
  return n * sign(p);
}

// one oversized triangle covers the whole screen
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((i << 1) & 2), f32(i & 2));
  return vec4f(corner * 2 - 1, 0, 1);
}

@fragment
fn fs(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let backdrop = textureLoad(page, vec2i(pixel.xy), 0);
  let halfSize = glass.size / 2;
  let p = pixel.xy - glass.position - halfSize;
  let d = roundedBox(p, halfSize, glass.radius);
  if (d > 0.5) {
    return backdrop;
  }

  let t = clamp(-d / bevel, 0, 1);
  let offset = 0.5 * bevel * (1 - t) * (1 - t); // 0.5 is the most stretch you can get before sample depth flips and makes content look weird
  let source = pixel.xy - outward(p, halfSize, glass.radius) * offset;

  let white = 0.0; 
  let frosted = blur(vec2i(source)) * (1 - white) + white;
  return mix(backdrop, frosted, clamp(0.5 - d, 0, 1));
}
