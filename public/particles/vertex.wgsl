@group(0) @binding(1) var<storage> state: array<Particle>;
struct Particle {
    pos: vec2f,
    vel: vec2f,
    age: f32,
    lifespan: f32,
    color: vec3f,
}

struct VOutput {
  @builtin(position) pos: vec4f,
  @location(0) age: f32, // This passes the age to the fragment shader
  @location(1) color: vec3f,
}

@vertex
fn vs(
  @location(0) input : vec2f,
  @builtin(instance_index) idx : u32
) -> VOutput {
  var out: VOutput;
  let p = state[idx];
  let new_pos = p.pos + input * .01;
  out.pos = vec4f(new_pos, 0.0, 1.0); // pass all parameters to fragment shader
  out.age = p.age/p.lifespan;
  out.color = p.color;
  return out;
}