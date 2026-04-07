@group(0) @binding(0) var<uniform> resolution: vec2f;
@group(0) @binding(1) var videoSampler:   sampler;
@group(0) @binding(2) var backBuffer:     texture_2d<f32>;
@group(0) @binding(3) var<uniform> time:  f32;
@group(0) @binding(4) var<uniform> mouse: vec2f;
@group(0) @binding(5) var<uniform> params: vec4f;
@group(1) @binding(0) var videoBuffer:    texture_external;

// 2D Random
fn random (st : vec2f) -> vec2f {
    return fract(sin(vec2f(dot(st,vec2f(127.1,311.7)),dot(st,vec2f(269.5,183.3))))  * 434384.3);
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
  let noiseAmt = snoise(p * 2.0 + vec2f(time * params[0])); // noise for movement
  var st = p + vec2f(noiseAmt * 0.08); // coef control noise amplification
  let nNoise = noiseAmt * 0.5 + 0.5;
  let scaleAmt = params[1];
  st.x *= resolution.x / resolution.y;
  st *= scaleAmt; // make grid

  // mouse coords need match screen
  var m_pos = mouse;
  m_pos.x *= resolution.x / resolution.y;
  m_pos *= scaleAmt;

  let i_st = floor(st);
  let f_st = fract(st);
  var color = vec3f(.0);

  var m_dist = 10.;  // minimum distance
  var m_dist2 = 10.; // second min dist
  var m_diff = vec2f(0.0); // center of video

  // iterate through points around this cell in grid
  for (var y: i32 = -1; y <= 1; y++) {
      for (var x: i32 = -1; x <= 1; x++) {
        let neighbor = vec2f(f32(x), f32(y)); // neighbor place in grid
        var point_new = random(i_st + neighbor); // rand pos from neighbor and current place in grid

        // make new center point go in circle
        point_new = vec2f(0.5) + vec2f(0.5) * sin(vec2f(time) + 6.2831 * point_new);

        // find point in grid, and find direction from mouse
        let grid_point = vec2f(i_st) + neighbor + point_new;
        let mouse_dir = grid_point - m_pos + vec2f(0.0001);
        let dist_mouse = length(mouse_dir);
        let avoid_amt = smoothstep(1.5, 0.0, dist_mouse); // smooth transition away from mouse
        point_new += normalize(mouse_dir) * avoid_amt * params[3]; // adds normal amt to point to avoid mouse area

        let diff = neighbor + point_new - f_st; // difference between animated point and current pixel
        let dist = length(diff);

        // Keep the closer distance and point
        if (dist < m_dist) {
            m_dist2 = m_dist;
            m_dist = dist;
            m_diff = diff;
        } else if (dist < m_dist2) {
            m_dist2 = dist;
        }
      }
  }

  let diff = m_dist2 - m_dist; // distance between two minimum points
  let cellMask = smoothstep(0.0, 0.3, diff); // darken around cell smooth
  var cellCoord = -m_diff * 1.5 + vec2f(0.5); // put each image inside cell centered
  cellCoord -= abs(sin(7.*m_dist))* time * params[2]; // spinny

  let video = textureSampleBaseClampToEdge( videoBuffer, videoSampler, cellCoord);

  let fb = textureSample( backBuffer, videoSampler, p );

  let out = video * cellMask + fb * (1.0 - cellMask) * 0.95;






























  return vec4f( out.rgb, 1. );

}

































