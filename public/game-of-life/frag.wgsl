@group(0) @binding(0) var<uniform> res:   vec2f;
@group(0) @binding(1) var<storage> state: array<vec2f>;

@fragment
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let x = u32(floor(pos.x));
  let y = u32(floor(pos.y));
  let idx : u32 = y * u32(res.x) + x;
  let v = state[ idx ];
  let color = v.x - v.y; // B subtracted from A value
  return vec4f( color, color, color, 1.);
}
