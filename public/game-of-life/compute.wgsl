@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<storage> statein: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> stateout: array<vec2f>;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<uniform> mouse: vec4f;

struct Params {
    Da: f32,
    Db: f32,
    feed_rate: f32,
    kill_rate: f32,
    stretchX: f32,
    stretchY: f32,
    dummyval1: f32,
    dummyval2: f32,
}
fn index( x:i32, y:i32 ) -> u32 {
  let _res = vec2i(res);
  let abs_x = (x + _res.x) % _res.x;
  let abs_y = (y + _res.y) % _res.y;
  return u32( abs_y * _res.x + abs_x);
}

@compute
@workgroup_size(8,8)
fn cs( @builtin(global_invocation_id) _cell:vec3u ) {
  let cell = vec3i(_cell);


  let i = index(cell.x, cell.y);
  let concentrations = statein[i]; // concentrations of substances
  let a = concentrations.x;
  let b = concentrations.y;
  // laplace grid vals with orientation calculation to 1
  let laplace_side_x = 0.2 * params.stretchX;
  let laplace_side_y = 0.2 * params.stretchY;
  let laplace_diagonal = 0.05 * (params.stretchX + params.stretchY) *.5;
  let laplace_center = -((laplace_side_x * 2.0) + (laplace_side_y * 2.0) + (laplace_diagonal * 4.0));
  // can find neighbors and calculate laplace at same time
  let laplace =         statein[ index(cell.x, cell.y)] * laplace_center + // center
                        statein[ index(cell.x + 1, cell.y + 1) ] * laplace_diagonal + // top right
                        statein[ index(cell.x + 1, cell.y)     ] * laplace_side_x + // right side
                        statein[ index(cell.x + 1, cell.y - 1) ] * laplace_diagonal + // bottom right
                        statein[ index(cell.x, cell.y - 1)     ] * laplace_side_y + // bottom side
                        statein[ index(cell.x - 1, cell.y - 1) ] * laplace_diagonal + // bottom left
                        statein[ index(cell.x - 1, cell.y)     ] * laplace_side_x + // left side
                        statein[ index(cell.x - 1, cell.y + 1) ] * laplace_diagonal + // top left
                        statein[ index(cell.x, cell.y + 1)     ] * laplace_side_y; // top side
  // equation params
  let delta_t = 1.0;
  let reaction = a * b * b;
  // equation from Karl Sims
  var a_prime = a + (params.Da * laplace.x - reaction + params.feed_rate * (1.0 - a)) * delta_t;
  var b_prime = b + (params.Db * laplace.y + reaction - (params.kill_rate + params.feed_rate) * b) * delta_t;

  if (mouse.z > 0.0) { // if mouse is clicked, and pixel is within radius, then paint B there
    let pos = vec2f(f32(cell.x), f32(cell.y));
    let mouseCoord = vec2f(mouse.x, mouse.y);

    if (distance(pos, mouseCoord) < mouse.w) {
        b_prime = 1.0;
        a_prime = 0.0;
    }
  }
  stateout[i] = vec2f(clamp(a_prime, 0.0, 1.0), clamp(b_prime, 0.0, 1.0));
}
