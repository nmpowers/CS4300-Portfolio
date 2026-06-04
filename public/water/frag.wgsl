// Renders the simulated height field as a deep, pixelated sea: faint brownian
// base waves perturb a Blinn-Phong surface, and the white poem text floats in
// the water, refracted by the ripples and dissolving as it fades.

@group(0) @binding(0) var<uniform> res:   vec2f;
@group(0) @binding(1) var<storage>  state: array<vec2f>;
// binding 2 is the second ping-pong buffer (unused here, declared by the layout)
@group(0) @binding(3) var<uniform> u:     vec4f; // time, textFade, pixelSize, noiseAmt
@group(0) @binding(4) var<uniform> light: vec4f; // lightDir.xyz, heightScale
@group(0) @binding(5) var samp:    sampler;
@group(0) @binding(6) var textTex: texture_2d<f32>;
@group(0) @binding(7) var<uniform> well: vec4f;  // radius, intensity, depth(vignette), shimmer

// ---- value noise / fbm for the faint base swell -------------------------------
fn hash21( p:vec2f ) -> f32 {
    var p3 = fract( vec3f( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

fn vnoise( p:vec2f ) -> f32 {
    let i = floor( p );
    let f = fract( p );
    let w = f * f * ( 3.0 - 2.0 * f );
    let a = hash21( i );
    let b = hash21( i + vec2f(1.0, 0.0) );
    let c = hash21( i + vec2f(0.0, 1.0) );
    let d = hash21( i + vec2f(1.0, 1.0) );
    return mix( mix(a,b,w.x), mix(c,d,w.x), w.y );
}

fn fbm( p:vec2f ) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var pp = p;
    for( var i = 0; i < 5; i++ ) {
        v += a * vnoise( pp );
        pp *= 2.0;
        a *= 0.5;
    }
    return v;
}

// drifting brownian swell with a choppy high-frequency layer on top, so the
// surface reads as a restless, wind-and-rain-roughened sea (centred around zero)
fn baseWave( uv:vec2f, t:f32 ) -> f32 {
    let a = fbm( uv * 5.0  + vec2f( t * 0.30, -t * 0.20 ) ) - 0.5;
    let b = fbm( uv * 11.0 - vec2f( t * 0.15,  t * 0.10 ) ) - 0.5;
    let c = fbm( uv * 23.0 + vec2f( -t * 0.45, t * 0.35 ) ) - 0.5;
    return a * 0.55 + b * 0.30 + c * 0.30;
}

fn simH( px:i32, py:i32 ) -> f32 {
    let r = vec2i( res );
    let cx = clamp( px, 0, r.x - 1 );
    let cy = clamp( py, 0, r.y - 1 );
    return state[ u32( cy * r.x + cx ) ].x;
}

// total surface height (simulated ripples + faint base swell) at a block centre
fn totalH( bp:vec2f ) -> f32 {
    let ip  = vec2i( bp );
    let sim = simH( ip.x, ip.y ) * light.w;
    let uv  = bp / res.y;                 // aspect-correct (same scale on both axes)
    let base = baseWave( uv, u.x ) * u.w;
    return sim + base;
}

fn sampleText( uv:vec2f ) -> f32 {
    return textureSampleLevel( textTex, samp, uv, 0.0 ).a;
}

@fragment
fn fs( @builtin(position) pos: vec4f ) -> @location(0) vec4f {
    // snap to a chunky pixel grid for the pixelated look
    let ps    = max( u.z, 1.0 );
    let block = floor( pos.xy / ps ) * ps + ps * 0.5;

    // surface normal from the height-field gradient
    let off = ps;
    let dx = totalH( block + vec2f(off, 0.0) ) - totalH( block - vec2f(off, 0.0) );
    let dy = totalH( block + vec2f(0.0, off) ) - totalH( block - vec2f(0.0, off) );
    let normal = normalize( vec3f( -dx, -dy, 1.0 ) );

    // ---- lighting: deep sea base + diffuse + white specular glints -----------
    let L = normalize( light.xyz );
    let V = vec3f( 0.0, 0.0, 1.0 );
    let H = normalize( L + V );
    let diff = max( dot( normal, L ), 0.0 );
    let spec = pow( max( dot( normal, H ), 0.0 ), 90.0 );
    let fres = pow( 1.0 - max( normal.z, 0.0 ), 3.0 );

    let deep = vec3f( 0.004, 0.018, 0.045 ); // near-black sea blue
    let mid  = vec3f( 0.010, 0.060, 0.120 );
    let sky  = vec3f( 0.090, 0.170, 0.260 );

    var col = mix( deep, mid, diff );
    col += sky * fres * 0.35;
    col += vec3f( 1.0, 0.97, 0.90 ) * spec * 0.12; // faint glints on open water

    let uv = block / res;

    // ---- looking up from the bottom of a well: a faint disc of daylight ------
    // reflected on the water, its edge shimmering as ripples bend the surface.
    let aspect = res.x / res.y;
    let centred = vec2f( ( uv.x - 0.5 ) * aspect, uv.y - 0.45 );
    let wobble  = normal.xy * well.w;                 // ripples wobble the reflection
    let reflected = centred + vec2f( wobble.x * aspect, wobble.y );
    let rd   = length( reflected );
    let disc = smoothstep( well.x, well.x * 0.25, rd );
    let sun  = vec3f( 0.78, 0.88, 1.0 ); // pale, cool daylight from the well mouth
    col += sun * disc * well.y;                       // the soft daylight pool
    col += sun * spec * disc * 1.3;                   // rain sparkles where the light lands

    // dark, damp well walls closing in around that pool of light
    let vd  = length( centred );
    let vig = smoothstep( 1.05, 0.15, vd );
    col *= mix( 1.0 - well.z, 1.0, vig );

    // ---- poem text floating in the water ------------------------------------
    let refr = normal.xy * 0.018;          // ripples bend the text (refraction)
    let suv  = uv + refr;

    // each verse carries its own fade baked into the texture's alpha, so the
    // dissolve is driven per-pixel: as a verse's alpha drops it erodes against
    // drifting noise, independently of any other verse floating nearby.
    let dn   = fbm( uv * 38.0 + vec2f( 0.0, u.x * 0.25 ) );
    let core = smoothstep( 0.0, 0.5, sampleText( suv ) - dn * 0.5 );

    // soft white glow halo from a ring of samples (fades with the alpha too)
    var glow = 0.0;
    let g = 2.2 / res.y;
    glow += sampleText( suv + vec2f(  g,  0.0 ) );
    glow += sampleText( suv + vec2f( -g,  0.0 ) );
    glow += sampleText( suv + vec2f( 0.0,  g  ) );
    glow += sampleText( suv + vec2f( 0.0, -g  ) );
    glow += sampleText( suv + vec2f(  g,  g  ) );
    glow += sampleText( suv + vec2f( -g,  g  ) );
    glow += sampleText( suv + vec2f(  g, -g  ) );
    glow += sampleText( suv + vec2f( -g, -g  ) );
    glow = glow / 8.0;

    let textColor = vec3f( 0.85, 0.93, 1.0 );
    col += textColor * glow * 0.8;                 // halo, brightened by crests
    col += textColor * core * ( 1.4 + spec * 2.0 );

    // gentle tone mapping
    col = col / ( col + vec3f(1.0) );
    col = pow( col, vec3f( 0.85 ) );

    return vec4f( col, 1.0 );
}
