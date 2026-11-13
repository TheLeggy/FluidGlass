struct Glass {
  position: vec2f,
  size: vec2f,
  radius: f32,
  scale: f32,
}

@group(0) @binding(0) var page: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> glasses: array<Glass>;
@group(0) @binding(2) var pageSampler: sampler;

// bevel
const bevel = 21.0;
const foldFringe = 0.25;
const stretchFringe = 0.12;
// frosting
const sigma = 0.0;
const white = 0.0;
// fold
const foldShare = 0.3;
const foldRoom = 24.0;

// fixed limits
const stretchFloor = 0.15; // at 0 a single row of pixels gets smeared across the whole rim
const foldMax = 6.0; // any wider and the fold starts to look like a glowing ring

fn pageAt(p: vec2f) -> vec4f {
  return textureSampleLevel(page, pageSampler, p / vec2f(textureDimensions(page)), 0);
}

fn blur(at: vec2f) -> vec4f {
  if (sigma == 0) {
    return pageAt(at);
  }
  let reach = i32(ceil(3 * sigma)); // past 3 sigma the weights are too small to see
  var sum = vec4f(0);
  var total = 0.0;
  for (var y = -reach; y <= reach; y++) {
    for (var x = -reach; x <= reach; x++) {
      let weight = exp(-f32(x * x + y * y) / (2 * sigma * sigma));
      sum += weight * pageAt(at + vec2f(f32(x), f32(y)));
      total += weight;
    }
  }
  return sum / total;
}

fn toGamma(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

fn toLinear(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

// distance to the edge, negative inside
fn roundedBox(p: vec2f, halfSize: vec2f, r: f32) -> f32 {
  let q = abs(p) - halfSize + r;
  return length(max(q, vec2f(0))) + min(max(q.x, q.y), 0) - r;
}

// direction comes from a rounder rect otherwise every corner shows a ridge along its diagonal
fn outward(p: vec2f, halfSize: vec2f, r: f32, width: f32) -> vec2f {
  let wide = min(r + width, min(halfSize.x, halfSize.y));
  let b = max(abs(p) - halfSize + wide, vec2f(0));
  if (length(b) > 1e-3) {
    return sign(p) * normalize(b);
  }
  if (halfSize.x - abs(p.x) < halfSize.y - abs(p.y)) {
    return vec2f(sign(p.x), 0);
  }
  return vec2f(0, sign(p.y));
}

fn stretchOffset(depth: f32, curve: f32) -> f32 {
  let t = clamp(depth / max(curve, 1e-3), 0, 1);
  return curve * (1 - stretchFloor) * (0.5 - t + t * t * t - 0.5 * t * t * t * t);
}

fn foldOffset(depth: f32, curve: f32, body: f32, frost: f32, scale: f32) -> f32 {
  let span = max(min(curve * foldShare, foldMax * scale), 1e-3);
  let ratio = frost / span;
  let room = min(clamp(1.2 * body - curve, 0, 1.6 * curve), foldRoom * scale) / (1 + ratio * ratio);
  let t = clamp(depth / span, 0, 1);
  return room * (1 - t) * (1 - t);
}

fn spectral(p: vec2f, dir: vec2f, off: f32, fringe: f32) -> vec3f {
  const red = array<f32, 6>(0.5, 0.4, 0.1, 0.0, 0.0, 0.0);
  const green = array<f32, 6>(0.0, 0.2, 0.3, 0.3, 0.2, 0.0);
  const blue = array<f32, 6>(0.0, 0.0, 0.0, 0.1, 0.4, 0.5);
  var sum = vec3f(0);
  for (var i = 0; i < 6; i++) {
    let spread = off + ((f32(i) + 0.5) / 6 - 0.5) * 2 * fringe;
    sum += pageAt(p - dir * spread).rgb * vec3f(red[i], green[i], blue[i]);
  }
  return sum;
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
  var glass = glasses[0];
  var d = roundedBox(pixel.xy - glass.position - glass.size / 2, glass.size / 2, glass.radius);
  for (var i = 1u; i < arrayLength(&glasses); i++) {
    let other = glasses[i];
    let otherD = roundedBox(pixel.xy - other.position - other.size / 2, other.size / 2, other.radius);
    if (otherD < d) {
      glass = other;
      d = otherD;
    }
  }
  if (d > 0.5) {
    return backdrop;
  }

  let halfSize = glass.size / 2;
  let p = pixel.xy - glass.position - halfSize;
  let width = bevel * glass.scale;
  let body = min(halfSize.x, halfSize.y);
  let curve = min(width, body);
  let depth = max(-d, 0);
  let stretched = stretchOffset(depth, curve);
  let folded = foldOffset(depth, curve, body, sigma, glass.scale);
  let off = stretched + folded;
  let fringe = folded * foldFringe + stretched * stretchFringe;

  let dir = outward(p, halfSize, glass.radius, width);
  let source = pixel.xy - dir * off;
  var refracted = blur(source);
  if (fringe > 0.03 * glass.scale) {
    refracted = vec4f(spectral(pixel.xy, dir, off, fringe), refracted.a);
  }

  // in linear light a small change to white looks huge
  let frosted = vec4f(toLinear(mix(toGamma(refracted.rgb), vec3f(1), white)), mix(refracted.a, 1, white));
  return mix(backdrop, frosted, clamp(0.5 - d, 0, 1));
}
