import { default as seagulls } from '../gulls/gulls.js'
import { Pane } from 'https://esm.sh/tweakpane';

const WORKGROUP_SIZE = 64,
    NUM_AGENTS = 256,
    DISPATCH_COUNT = [NUM_AGENTS/WORKGROUP_SIZE,1,1],
    GRID_SIZE = 2,
    STARTING_AREA = .3

const W = Math.round( window.innerWidth  / GRID_SIZE ),
    H = Math.round( window.innerHeight / GRID_SIZE )

const modes = { Original: 0, Turmite: 1, Follower: 2 } // 0 is the original behavior, 1 is a turmite with spiral patterns, 2 is a follower that leaves scent behind

const render_shader = seagulls.constants.vertex + `
@group(0) @binding(0) var<storage> pheromones: array<f32>;
@group(0) @binding(1) var<storage> render: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

struct Params {
    mode: f32, 
    decay: f32, 
    sensor_distance: f32, 
    deposit: f32
}

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let grid_pos = floor( pos.xy / ${GRID_SIZE}.);
  
  let pidx = grid_pos.y  * ${W}. + grid_pos.x;
  let p = pheromones[ u32(pidx) ];
  let v = render[ u32(pidx) ];

  // mode 1 is turmite, using three states
  // mode 2 is follower, which uses continous pheromone values
  // mode 0 original mode
  var bg = vec3f(0.);
  if(params.mode > 1.5) { // follower mode
    let t = clamp(p, 0., 1.);
    bg = vec3f(t, t*t, t*t*t*.3);
  } else if (params.mode > .5) { // turmite mode
    if (p > 1.5) { // make colors different based on pheromones
        bg = vec3f(0.2, 0.45, 0.85);
    } else if (p > 0.5) {
        bg = vec3f(0.85, 0.75, 0.20);
    } else {
        bg = vec3f(.05, .05, .08);
    }
  } else { // og mode
    bg = vec3f(p);
  }
  
  let out = select(bg, vec3f(1., 0., 0.), v == 1.);
  return vec4f(out, 1.);
}`

const compute_shader =`
struct Vant {
  pos: vec2f,
  dir: f32,
  flag: f32
}

struct Params {
    mode: f32, 
    decay: f32, 
    sensor_distance: f32, 
    deposit: f32
}

@group(0) @binding(0) var<storage, read_write> vants: array<Vant>;
@group(0) @binding(1) var<storage, read_write> pheromones: array<f32>;
@group(0) @binding(2) var<storage, read_write> render: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

const PI2: f32 = ${Math.PI *2};
const W: f32 = ${W}.; 
const H: f32 = ${H}.;

fn pheromoneIndex( vant_pos: vec2f ) -> u32 {
  let x = ((vant_pos.x % W) + W) % W;
  let y = ((vant_pos.y  % H) + H) % H;
  return u32( y * W + x);
}

fn sample(pos: vec2f, head: f32, ahead: f32, side: f32) -> f32 {
    // uses ahead offset in head direction, + the side perpendicular for ruling on sample
    let fwd = vec2f(sin(head*PI2), cos(head*PI2));
    let perpendicular = vec2f(fwd.y, -fwd.x);
    let p = pos + fwd * ahead + perpendicular * side;
    return pheromones[pheromoneIndex(p)];
}

@compute
@workgroup_size(${WORKGROUP_SIZE},1,1)

fn cs(@builtin(global_invocation_id) cell:vec3u)  {
  var vant:Vant  = vants[ cell.x ];
  let pIndex    = pheromoneIndex( vant.pos );
  let pheromone = pheromones[ pIndex ];
  
  // original mode (0)
  if (params.mode < .5) {
    if( pheromone != 0. ) {
        vant.dir += select(.25,-.25,vant.flag==0.); // turn 90 degrees counter-clockwise
        pheromones[ pIndex ] = 0.;  // set pheromone flag
    } else{
        vant.dir += select(-.25,.25,vant.flag==0.); // turn 90 degrees counter-clockwise
        pheromones[ pIndex ] = 1.;  // unset pheromone flag
    }
    let dir = vec2f(sin(vant.dir*PI2), cos(vant.dir*PI2));
    vant.pos = round(vant.pos + dir);
  } else if(params.mode < 1.5){ // turmite mode (1)
    let state = round(pheromone);
    var turn = 0.;
    var write = 0.;
    if(state < 0.5) { // 0 is right, write 1
        turn = -0.25;
        write = 1.;
    } else if (state < 1.5) { // 1 is left, write 2
        turn = .25;
        write = 2.;
    } else { // 2 is right, write 0
        turn = -0.25;
        write = 0.;
    }
    pheromones[ pIndex ] = write;
    // flag on the vant makes spiral the other way
    if (vant.flag != 0.){
        turn = -turn;
    }
    vant.dir += turn;
    
    let dir = vec2f(sin(vant.dir*PI2), cos(vant.dir*PI2));
    vant.pos = round(vant.pos + dir);
  } else { // follow mode (2) - steers toward the strongest scent, drop scent at same time
    let dist = params.sensor_distance;
    let angle = 0.07; 
    
    let f = sample(vant.pos, vant.dir, dist, 0.); // samples at each direction
    let l = sample(vant.pos, vant.dir + angle, dist, 0.);
    let r = sample(vant.pos, vant.dir - angle, dist, 0.);
    
    if(f >= l && f >= r){ // if pheromone is more in forward direction, go there, if not follow left or right
    } else if (l > r){
        vant.dir += angle;
    } else {
        vant.dir -= angle;
    }
    // little tweak in direction to keep everything from going in single line
    let wiggle = (fract(sin(f32(cell.x)*12.9898 + vant.pos.x * 0.013 + vant.pos.y * .071) * 43758.5) - .5) * .02;
    vant.dir += wiggle;
    
    let dir = vec2f(sin(vant.dir*PI2), cos(vant.dir*PI2));
    vant.pos = round(vant.pos + dir); 
    
    //drop scent and apply decay
    let newIdx = pheromoneIndex(vant.pos);
    let cur = pheromones[newIdx];
    pheromones[newIdx] = clamp(cur * params.decay + params.deposit, 0., 1.);
    
  }

  
  // we'll look at the render buffer in the fragment shader
  // if we see a value of one a vant is there and we can color
  // it accordingly. in our JavaScript we clear the buffer on every
  // frame.
  vants[cell.x] = vant;
  render[ pIndex ] = 1.;
}`

const NUM_PROPERTIES = 4 // must be evenly divisble by 4!
const pheromones   = new Float32Array( W*H ) // hold pheromone data
const vants_render = new Float32Array( W*H ) // hold info to help draw vants
const vants        = new Float32Array( NUM_AGENTS * NUM_PROPERTIES ) // hold vant info
function seed() {
    const offset = .5 - STARTING_AREA / 2
    for (let i = 0; i < NUM_AGENTS * NUM_PROPERTIES; i += NUM_PROPERTIES) {
        vants[i] = Math.floor((offset + Math.random() * STARTING_AREA) * W) // x
        vants[i + 1] = Math.floor((offset + Math.random() * STARTING_AREA) * H) // y
        vants[i + 2] = 0 // direction
        vants[i + 3] = Math.round(Math.random()) // vant behavior type
    }
}
seed()

const sg = await seagulls.init()
const pheromones_b = sg.buffer( pheromones )
const vants_b  = sg.buffer( vants )
const render_b = sg.buffer( vants_render )

const params = {
    mode: 'Original',
    decay: 0.97,
    sensor_distance: 6.0,
    deposit: 0.25,
    reset: () => reset()
}
const paramsData = sg.uniform([modes[params.mode], params.decay, params.sensor_distance, params.deposit]);
const modeUniform = sg.uniform([modes[params.mode]]);
const pane = new Pane({title: 'vants'})
pane.addBinding(params, 'mode', {
    options: {Original: 'Original', Turmite: 'Turmite', Follower: 'Follower' }
}).on('change', () => reset());

const followerSection = pane.addFolder({title: 'follower', expanded: false})
followerSection.addBinding(params, 'decay', {min: 0.8, max: 1., label: 'decay'});
followerSection.addBinding(params, 'sensor_distance', {min: 1, max: 20, label: 'sensor distance'});
followerSection.addBinding(params, 'deposit', {min: 0.01, max: 1., label: 'deposit'});

pane.addButton({title: 'reset'}).on('click', () => reset());

function reset() {
    pheromones.fill(0.)
    vants_render.fill(0.)
    seed()

    sg.device.queue.writeBuffer(pheromones_b.buffer, 0, pheromones)
    sg.device.queue.writeBuffer(vants_b.buffer, 0, vants)
    sg.device.queue.writeBuffer(render_b.buffer, 0, vants_render)
}

const render = await sg.render({
    shader: render_shader,
    data:[
        pheromones_b,
        render_b,
        paramsData
    ],
})

const compute = sg.compute({
    shader: compute_shader,
    data:[
        vants_b,
        pheromones_b,
        render_b,
        paramsData
    ],
    onframe() {
        render_b.clear()
        paramsData.value = [ modes[params.mode], params.decay, params.sensor_distance, params.deposit]
        console.log(modes[params.mode])
    },
    dispatchCount:DISPATCH_COUNT
})

sg.run( compute, render )