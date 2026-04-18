@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<storage> statein: array<Particle>;
@group(0) @binding(2) var<storage, read_write> stateout: array<Particle>;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<uniform> mouse: vec4f;

struct Particle {
    pos: vec2f,
    vel: vec2f,
    age: f32,
    lifespan: f32,
    color: vec3f,
}

struct Params {
    velx: f32,
    vely: f32,
    lifespan: f32,
    amt: f32,
    gravity: f32,
}


fn index( x:i32, y:i32 ) -> u32 {
  let _res = vec2i(res);
  let abs_x = (x + _res.x) % _res.x;
  let abs_y = (y + _res.y) % _res.y;
  return u32( abs_y * _res.x + abs_x);
}

fn random (st : vec2f) -> vec2f {
    return fract(sin(vec2f(dot(st,vec2f(127.1,311.7)),dot(st,vec2f(269.5,183.3))))  * 434384.3);
}

fn random3(st: vec2f) -> vec3f {
    return fract(sin(vec3f(dot(st, vec2f(127.1, 311.7)), dot(st, vec2f(269.5, 183.3)), dot(st, vec2f(419.2, 371.9)))) * 434384.3);
}



@compute
@workgroup_size(64)
fn cs( @builtin(global_invocation_id) _cell:vec3u ) {
  let cell = vec3i(_cell);
  let id = f32(_cell.x); // index for particle in the workgroup
  let p = statein[_cell.x]; // data for particle

  let new_pos = vec2f(p.pos.x + p.vel.x, p.pos.y + p.vel.y);
  let new_vel = vec2f(p.vel.x, p.vel.y - params.gravity); // gravity from velocity y
  let new_age = f32(p.age - 1.0);
  var new_particle = Particle(new_pos, new_vel, new_age, p.lifespan, p.color);

  var diff = abs(id - mouse.w);
  if (diff > 600.0 * 0.5) { // wrapping around index
      diff = 600.0 - diff;
  }

  if (mouse.z > 0.0 && diff < (params.amt * 0.5)) { // if mouse is clicked, and index is within alotted amount, then we spawn new particle
    let randVal = random(vec2f(id, mouse.z)); // generate random velocity, speed, and color
    let angle = randVal.x * 6.283185;
    let randSpeed = vec2f(params.velx * randVal.y, params.vely * randVal.y);
    let uniqueVel = vec2f(cos(angle) * randSpeed.x, sin(angle) * randSpeed.y);
    let randColor = random3(vec2f(mouse.w, 123.45));


    let translatedX = (mouse.x/res.x) * 2. - 1.0;
    let translatedY = -(mouse.y/res.y) * 2 + 1.0;
    let mouseCoord = vec2f(translatedX, translatedY);

    new_particle = Particle(mouseCoord, uniqueVel, params.lifespan, params.lifespan, randColor);
  }
  stateout[_cell.x] = new_particle;
}
