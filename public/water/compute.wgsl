// Height-field water simulation.
// Each cell stores vec2f( height, velocity ). A classic explicit wave-equation
// integrator spreads disturbances out as ripples. Constant rain peppers the
// surface with tiny dimples so it churns like a choppy sea; a click is just one
// more (slightly bigger) raindrop that also carries a verse.

const RAIN_MAX : u32 = 16u;

@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<storage> statein: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> stateout: array<vec2f>;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<uniform> drop: vec4f;                 // x, y, strength, radius
@group(0) @binding(5) var<uniform> rain: array<vec4f, 16>;      // per-frame raindrops

struct Params {
    waveSpeed: f32, // propagation speed of ripples (keep <= 0.5 for stability)
    damping:   f32, // velocity damping per step
    slack:     f32, // gentle height decay so the pond settles back to calm
    pad:       f32,
}

// clamped (reflective) boundary so ripples bounce off the edges instead of wrapping
fn idx( x:i32, y:i32 ) -> u32 {
    let r = vec2i( res );
    let cx = clamp( x, 0, r.x - 1 );
    let cy = clamp( y, 0, r.y - 1 );
    return u32( cy * r.x + cx );
}

// downward push a single drop (x,y,strength,radius) imparts at pixel p this step
fn dropDelta( d: vec4f, p: vec2f ) -> f32 {
    if( d.z <= 0.0 ) { return 0.0; }
    let dist = distance( p, d.xy );
    if( dist >= d.w ) { return 0.0; }
    let falloff = 0.5 + 0.5 * cos( dist / d.w * 3.14159265 );
    return -d.z * falloff;
}

@compute
@workgroup_size(8,8)
fn cs( @builtin(global_invocation_id) gid: vec3u ) {
    let r = vec2i( res );
    let cell = vec3i( gid );
    if( cell.x >= r.x || cell.y >= r.y ) { return; }

    let i = idx( cell.x, cell.y );
    let s = statein[ i ];
    var h = s.x;
    var v = s.y;

    // laplacian of the height field from the four neighbours
    let up    = statein[ idx( cell.x,     cell.y - 1 ) ].x;
    let down  = statein[ idx( cell.x,     cell.y + 1 ) ].x;
    let left  = statein[ idx( cell.x - 1, cell.y     ) ].x;
    let right = statein[ idx( cell.x + 1, cell.y     ) ].x;
    let lap = ( up + down + left + right ) - 4.0 * h;

    v += lap * params.waveSpeed;
    v *= params.damping;
    h += v;
    h *= params.slack;

    // the clicked droplet plus every active raindrop dimple the surface
    let p = vec2f( f32(cell.x), f32(cell.y) );
    h += dropDelta( drop, p );
    for( var k = 0u; k < RAIN_MAX; k++ ) {
        h += dropDelta( rain[k], p );
    }

    stateout[ i ] = vec2f( h, v );
}
