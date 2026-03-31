@group(0) @binding(0) var<uniform> resolution: vec2f;
@group(0) @binding(1) var videoSampler:   sampler;
@group(0) @binding(2) var backBuffer:     texture_2d<f32>;
@group(0) @binding(3) var<uniform> time:  f32;
@group(1) @binding(0) var videoBuffer:    texture_external;

// 2D Random
fn random (st : vec2f) -> vec2f {
    return fract(sin(vec2(dot(st,vec2(127.1,311.7)),dot(st,vec2(269.5,183.3)))) * time * .3);
}

// Some useful functions
fn mod289_vec3(x : vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_vec2(x : vec2f) -> vec2f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute(x : vec3f) -> vec3f { return mod289_vec3(((x * 34.0) + vec3f(1.0)) * x); }

// Found in Book of Shaders: Noise
// Translated to WGSL
// Description : GLSL 2D simplex noise function
//      Author : Ian McEwan, Ashima Arts
//  Maintainer : ijm
//     Lastmod : 20110822 (ijm)
//     License :
//  Copyright (C) 2011 Ashima Arts. All rights reserved.
//  Distributed under the MIT License. See LICENSE file.
//  https://github.com/ashima/webgl-noise
//
fn snoise(v : vec2f) -> f32 {

    // Precompute values for skewed triangular grid
    const C = vec4f(0.211324865405187,
                        // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,
                        // 0.5*(sqrt(3.0)-1.0)
                        -0.577350269189626,
                        // -1.0 + 2.0 * C.x
                        0.024390243902439);
                        // 1.0 / 41.0

    // First corner (x0)
    var i  = floor(v + vec2f(dot(v, C.yy)));
    let x0 = v - i + vec2f(dot(i, C.xx));

    // Other two corners (x1, x2)
    var i1 = vec2f(0.0);
    i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
    let x1 = x0.xy + C.xx - i1;
    let x2 = x0.xy + C.zz;

    // Do some permutations to avoid
    // truncation effects in permutation
    i = mod289_vec2(i);
    let p = permute(
           permute( vec3f(i.y) + vec3f(0.0, i1.y, 1.0))
               + vec3f(i.x) + vec3f(0.0, i1.x, 1.0 ));

    var m = max(vec3f(0.5) - vec3f(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3f(0.0));

    m = m*m ;
    m = m*m ;

    // Gradients:
    //  41 pts uniformly over a line, mapped onto a diamond
    //  The ring size 17*17 = 289 is close to a multiple
    //      of 41 (41*7 = 287)

    let x = 2.0 * fract(p * C.www) - vec3f(1.0);
    let h = abs(x) - vec3f(0.5);
    let ox = floor(x + vec3f(0.5));
    let a0 = x - ox;

    // Normalise gradients implicitly by scaling m
    // Approximation of: m *= inversesqrt(a0*a0 + h*h);
    m *= vec3f(1.79284291400159) - 0.85373472095314 * (a0*a0+h*h);

    // Compute final noise value at P
    let gx = a0.x  * x0.x  + h.x  * x0.y;
    let gyz = a0.yz * vec2f(x1.x, x2.x) + h.yz * vec2f(x1.y, x2.y);
    let g = vec3f(gx, gyz.x, gyz.y);
    return 130.0 * dot(m, g);
}

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let p = pos.xy / resolution;
  var st = p;
  let noiseAmt = snoise(p);
  let nNoise = noiseAmt * 0.5 + 0.5;

  st.x *= resolution.x / resolution.y;

  var color = vec3f(.0);

  // Cell positions
  var points: array<vec2f, 5>;
  points[0] = random(vec2f(0.83, 0.75));
  points[1] = random(vec2f(0.60, 0.07));
  points[2] = random(vec2f(0.28, 0.64));
  points[3] = random(vec2f(0.31, 0.26));
  points[4] = random(vec2f(0.91, 0.12));

  var m_dist = 1.;  // minimum distance
  var m_point = vec2f(0.0); // min point

  // Iterate through the points positions
  for (var i = 0; i < 5; i++) {
    let dist = distance(st, points[i]);

    // Keep the closer distance and point
    if (dist < m_dist) {
        m_dist = dist;
        m_point = points[i];
    }
  }


  let cellMask = clamp(1.0 - (m_dist * 2.0), 0.0, 1.0); // darken around cell
  var cellCoord = (st - m_point)  + vec2f(0.5); // put each image inside cell

  let video = textureSampleBaseClampToEdge( videoBuffer, videoSampler, cellCoord);

  let fb = textureSample( backBuffer, videoSampler, p );

  let out = video * cellMask;

  return vec4f( out.rgb, 1. );
}
