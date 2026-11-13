@group(0) @binding(0) var page: texture_2d<f32>;

// one oversized triangle covers the whole screen
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((i << 1) & 2), f32(i & 2));
  return vec4f(corner * 2 - 1, 0, 1);
}

@fragment
fn fs(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  return textureLoad(page, vec2u(pixel.xy), 0);
}
