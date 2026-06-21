// Height-field water simulation. Each cell stores vec2f( height, velocity ).
// Reused in the final room of the poem, where the player's footsteps and their
// eventual dissolution into the sea drop ripples into the surface.

@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<storage> statein: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> stateout: array<vec2f>;
@group(0) @binding(3) var<uniform> params: vec4f; // waveSpeed, damping, slack, _
@group(0) @binding(4) var<uniform> drop:   vec4f; // x, y, strength, radius

fn idx( x:i32, y:i32 ) -> u32 {
    let r = vec2i( res );
    let cx = clamp( x, 0, r.x - 1 );
    let cy = clamp( y, 0, r.y - 1 );
    return u32( cy * r.x + cx );
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

    let up    = statein[ idx( cell.x,     cell.y - 1 ) ].x;
    let down  = statein[ idx( cell.x,     cell.y + 1 ) ].x;
    let left  = statein[ idx( cell.x - 1, cell.y     ) ].x;
    let right = statein[ idx( cell.x + 1, cell.y     ) ].x;
    let lap = ( up + down + left + right ) - 4.0 * h;

    v += lap * params.x;
    v *= params.y;
    h += v;
    h *= params.z;

    if( drop.z > 0.0 ) {
        let p = vec2f( f32(cell.x), f32(cell.y) );
        let d = distance( p, drop.xy );
        if( d < drop.w ) {
            let f = 0.5 + 0.5 * cos( d / drop.w * 3.14159265 );
            h -= drop.z * f;
        }
    }

    stateout[ i ] = vec2f( h, v );
}
