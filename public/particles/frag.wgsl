@group(0) @binding(0) var<uniform> res:   vec2f;

@fragment
fn fs( in: VOutput ) -> @location(0) vec4f {
  return vec4f( in.color, in.age);
}
