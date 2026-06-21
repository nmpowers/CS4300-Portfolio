@group(0) @binding(0) var<uniform> res:   vec2f;
@group(0) @binding(1) var<uniform> u_view: vec4f; // [pixelSize, timeOfDay, subtitleAlpha, time]
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var overlayTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> u_subtitle: vec4f;

// --- Helper Functions ---
fn rot2D(angle: f32) -> mat2x2f {
    let s = sin(angle); let c = cos(angle);
    return mat2x2f(c, -s, s, c);
}



fn hash21(p: vec2f) -> f32 {
    var p_ = fract(p * vec2f(123.34, 456.21));
    p_ += dot(p_, p_ + 45.32);
    return fract(p_.x * p_.y);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

fn fbm(x: vec2f) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var shift = vec2f(100.0);
    var rot = mat2x2f(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    var p = x;
    for (var i = 0; i < 5; i++) {
        v += a * hash21(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

// --- SDFs ---
fn sdBox(p: vec3f, b: vec3f) -> f32 {
    let q = abs(p) - b;
    return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdCylinder(p: vec3f, h: f32, r: f32) -> f32 {
    let d = abs(vec2f(length(p.xz), p.y)) - vec2f(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}

// Global material tracking
var<private> mat_id: i32 = 0;
// 0: sky/bg
// 1: building wall
// 2: roof
// 3: window
// 4: street

fn map(pos: vec3f) -> f32 {
    var d = 1000.0;
    
    // The ground / street
    let ground = pos.y + 0.0;
    
    // Domain Repetition for city blocks
    // We want a central street, so we mirror X or leave X gap.
    // Let's just create a grid of buildings.
    let cell = vec2f(20.0, 30.0);
    
    var p = pos;
    p.x = abs(p.x);
    p.x -= 15.0 + cell.x * 0.5; // Start buildings 15 units away from center
    
    let cell_idx_x = max(0.0, floor(p.x / cell.x + 0.5));
    let cell_idx_z = floor(p.z / cell.y + 0.5);
    
    p.x = p.x - cell_idx_x * cell.x;
    p.z = p.z - cell_idx_z * cell.y;
    
    let id = vec2f(cell_idx_x, cell_idx_z);
    
    // Uniform height for this building block based on ID
    let h_rand = 18.0 + hash21(id) * 1.0;
    let b_width = 7.5 + hash21(id + 1.0) * 0.5;
    let b_depth = 12.0;
    
    // Building Base
    let base = sdBox(p - vec3f(0.0, h_rand * 0.5, 0.0), vec3f(b_width, h_rand * 0.5, b_depth));
    
    // Cornice (Ledge)
    let cornice = sdBox(p - vec3f(0.0, h_rand, 0.0), vec3f(b_width + 0.3, 0.4, b_depth + 0.3));
    let base_with_cornice = min(base, cornice);
    
    // Mansard Roof
    // A sloped roof box
    var rp = p - vec3f(0.0, h_rand + 2.0, 0.0);
    // Tapering
    let taper = clamp(rp.y / 4.0, 0.0, 1.0);
    let roof = sdBox(rp, vec3f(b_width - taper*2.5, 2.0, b_depth - taper*2.5));
    
    // Chimneys
    // Just one solid chimney block to prevent moire patterns from high-frequency fracts
    var cp = rp - vec3f(b_width * 0.4, 2.0, b_depth * 0.5);
    let chimneys_all = sdBox(cp, vec3f(0.8, 2.5, 1.5));
    
    // Combine Building
    let building = smin(base_with_cornice, min(roof, chimneys_all), 0.2);
    
    // Smoke
    var smoke_d = 1000.0;
    // Only ~1 in 4 buildings has smoke
    if (hash21(id + 13.0) > 0.75) {
        // Add random offset to time for each chimney so they aren't synchronized
        let raw_t = u_view.w + hash21(id + 77.0) * 10.0;
        
        // Randomly add an emission gap for some chimneys so they stop emitting intermittently
        var gap = 0.0;
        if (hash21(id + 88.0) > 0.5) {
            gap = 0.5 + hash21(id + 101.0) * 1.5; // Gap duration
        }
        let cycle = 1.0 + gap; // Total cycle = active life (1.0) + gap
        
        var sp = cp - vec3f(0.0, 2.5, 0.0); // Start slightly above chimney
        
        // Two clumps to ensure continuous smoke
        for (var c = 0; c < 2; c++) {
            let fc = f32(c);
            let time_val = raw_t * 0.08 + fc * 0.5; // Slower rise
            
            let num_cycles = floor(time_val / cycle);
            let pt = time_val - num_cycles * cycle; // pt is [0, cycle]
            
            // Only render smoke during its active life (pt <= 1.0)
            if (pt <= 1.0) {
                let h_center = pt * 15.0; 
                
                // Grow then shrink to prevent popping when pt wraps to 0
                let overall_scale = sin(pt * 3.14159) * (1.0 + pt * 3.0);
                
                // Base wiggle for the entire clump
                let center_x = sin(raw_t * 1.0 + fc * 10.0) * pt * 3.0;
                let center_z = cos(raw_t * 0.8 + fc * 10.0) * pt * 3.0;
                
                // Inside the clump, draw 4 overlapping puffs to create a bumpy cloud shape
                for (var i = 0; i < 4; i++) {
                    let fi = f32(i);
                    
                    // Offset puffs to create a bumpy 2D-looking cloud shape
                    let offset_x = sin(fi * 2.4) * 0.9 * overall_scale;
                    let offset_y = (fi - 1.5) * 0.6 * overall_scale;
                    let offset_z = cos(fi * 2.4) * 0.9 * overall_scale;
                    
                    // Made denser by increasing base radius and variation
                    let r_puff = (0.75 + sin(fi) * 0.25) * overall_scale;
                    
                    let puff_pos = sp - vec3f(center_x + offset_x, h_center + offset_y, center_z + offset_z);
                    let puff = length(puff_pos) - r_puff;
                    
                    // Strong smooth-min to fuse them into a single clump
                    smoke_d = smin(smoke_d, puff, 0.8 * overall_scale + 0.2);
                }
            }
        }
    }
    
    // Avenue Trees
    var tp = pos;
    tp.x = abs(tp.x) - 10.0; // Place trees at x = +/- 10
    tp.z = (fract(tp.z / 6.0 + 0.5) - 0.5) * 6.0; // Space trees out
    let trees = length(tp - vec3f(0.0, 5.0, 0.0)) - (3.0 + fbm(pos.xz * 1.5) * 0.8);
    
    // Check materials
    if (ground < d) { d = ground; mat_id = 4; }
    if (building < d) { 
        d = building; 
        if (roof < base_with_cornice && roof < chimneys_all) { mat_id = 2; }
        else { mat_id = 1; }
    }
    if (trees < d) { d = trees; mat_id = 5; }
    if (smoke_d < d) { d = smoke_d; mat_id = 6; }
    
    return d;
}

fn calcNormal(p: vec3f) -> vec3f {
    let e = vec2f(0.01, 0.0);
    return normalize(vec3f(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}

fn getSky(rd: vec3f, tod: f32, t: f32) -> vec3f {
    // tod goes from 0.0 (sunrise) to 1.0 (night)
    
    let dawn_sky = vec3f(0.95, 0.8, 0.7); // Light warm peach
    let day_sky = vec3f(0.3, 0.6, 0.9); // Pure sky blue
    let dusk_sky = vec3f(0.9, 0.55, 0.4); // Coral orange
    let night_sky = vec3f(0.1, 0.15, 0.25); // Deep blue
    
    var sky = night_sky;
    if (tod < 0.3) {
        sky = mix(dawn_sky, day_sky, smoothstep(0.0, 0.3, tod));
    } else if (tod < 0.6) {
        sky = mix(day_sky, dusk_sky, smoothstep(0.3, 0.6, tod));
    } else if (tod < 0.8) {
        sky = mix(dusk_sky, night_sky, smoothstep(0.6, 0.8, tod));
    }
    
    // Gradient based on y
    sky = mix(sky * 0.5, sky, clamp(rd.y * 2.0 + 0.5, 0.0, 1.0));
    
    // Clouds (2D noise projected onto a sky plane)
    if (rd.y > 0.0) {
        // Project ray to a plane high above
        let cloud_plane = rd.xz / max(rd.y, 0.01);
        let cloud_uv = cloud_plane * 1.5 + vec2f(t * 0.2, t * 0.05); // Drifting across the sky
        
        let noise = fbm(cloud_uv);
        
        // Threshold noise to create fluffy cloud shapes
        let cloud_alpha = smoothstep(0.45, 0.65, noise);
        
        if (cloud_alpha > 0.0) {
            // Give clouds some internal shading (grays at edges, whites in center)
            let cloud_col = mix(vec3f(0.65, 0.65, 0.7), vec3f(1.0, 1.0, 1.0), smoothstep(0.45, 0.75, noise));
            
            // Fade clouds near the horizon
            let horizon_fade = smoothstep(0.0, 0.2, rd.y);
            
            sky = mix(sky, cloud_col, cloud_alpha * 0.9 * horizon_fade);
        }
    }
    
    // Eiffel Tower 2D Silhouette
    let e_dir = normalize(vec3f(0.0, 0.0, 1.0)); // Far down the avenue
    let e_dot = dot(vec3f(rd.x, 0.0, rd.z), vec3f(e_dir.x, 0.0, e_dir.z));
    if (e_dot > 0.99 && rd.y > -0.2) {
        let dx = abs(rd.x * 25.0);
        let dy = (rd.y + 0.18) * 3.0; // Base starts at rd.y = -0.18 (vanishing point)
        
        var is_tower = false;
        let w_scale = 2.0;
        
        // Base arches (wide at bottom)
        if (dy > 0.0 && dy < 0.2) {
            let width = (0.8 - dy * 1.5) * w_scale; // Tapers from 1.6 to 1.0
            if (dx < width) {
                // Add the arch cut-out
                if (dx > (0.5 - dy * 2.5) * w_scale) {
                    is_tower = true;
                }
            }
        }
        // First deck
        else if (dy >= 0.2 && dy < 0.22) {
            if (dx < 0.55 * w_scale) { is_tower = true; }
        }
        // Middle section
        else if (dy >= 0.22 && dy < 0.5) {
            let width = (0.45 - (dy - 0.22) * 0.8) * w_scale;
            if (dx < width) { is_tower = true; }
        }
        // Second deck
        else if (dy >= 0.5 && dy < 0.52) {
            if (dx < 0.28 * w_scale) { is_tower = true; }
        }
        // Top Spire
        else if (dy >= 0.52 && dy < 1.0) {
            let width = (0.18 - (dy - 0.52) * 0.3) * w_scale;
            if (dx < width) { is_tower = true; }
        }
        // Very top antenna
        else if (dy >= 1.0 && dy < 1.1) {
            if (dx < 0.02 * w_scale) { is_tower = true; }
        }

        if (is_tower) {
            // Lattice cutout (chainlink / checkerboard pattern)
            // Don't cut holes in the horizontal decks or the antenna
            let is_deck = (dy >= 0.2 && dy < 0.22) || (dy >= 0.5 && dy < 0.52) || dy >= 1.0;
            if (!is_deck) {
                var current_width = 0.0;
                if (dy > 0.0 && dy < 0.2) {
                    current_width = (0.8 - dy * 1.5) * w_scale;
                } else if (dy >= 0.22 && dy < 0.5) {
                    current_width = (0.45 - (dy - 0.22) * 0.8) * w_scale;
                } else if (dy >= 0.52 && dy < 1.0) {
                    current_width = (0.18 - (dy - 0.52) * 0.3) * w_scale;
                }

                var current_inner = 0.0;
                if (dy > 0.0 && dy < 0.2) {
                    current_inner = (0.5 - dy * 2.5) * w_scale;
                }
                
                let margin = 0.08;
                if (dx < current_width - margin && dx > current_inner + margin) {
                    let check_x = fract(dx * 12.0) > 0.5;
                    let check_y = fract(dy * 12.0) > 0.5;
                    if (check_x == check_y) {
                        is_tower = false; 
                    }
                }
            }
            
            if (is_tower) {
                sky = mix(sky, vec3f(0.1, 0.1, 0.12), 0.85); // Dark silhouette
            }
        }
    }
    
    return sky;
}

@fragment
fn fs(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
    let t = u_view.w;
    let tod = u_view.y; // 0.0 to 1.0
    
    // Pixelation
    let ps = max(u_view.x, 1.0);
    let block = floor(fragPos.xy / ps) * ps + ps * 0.5;
    var uv = block / res;
    uv = uv * 2.0 - 1.0;
    uv.y = -uv.y;
    let aspect = res.x / res.y;
    let uv_aspect = vec2f(uv.x * aspect, uv.y);
    
    // Camera
    let ro = vec3f(0.0, 35.0, 0.0); // Static camera, perfectly centered, slightly elevated
    let rd = normalize(vec3f(uv_aspect, 1.5));
    
    var p = ro;
    var d = 0.0;
    var hit = false;
    
    for (var i = 0; i < 100; i++) {
        let sd = map(p);
        if (sd < 0.01) { hit = true; break; }
        if (d > 200.0) { break; }
        d += sd;
        p = ro + rd * d;
    }
    
    var col = getSky(rd, tod, t);
    
    if (hit) {
        let n = calcNormal(p);
        
        // Sun position
        let sun_angle = mix(-3.14, 0.0, tod);
        let sun_dir = normalize(vec3f(cos(sun_angle), sin(sun_angle), 0.5));
        
        let dif = max(0.0, dot(n, sun_dir));
        let amb = 0.2 + max(0.0, n.y) * 0.1;
        
        var base_col = vec3f(0.5); // Default grey
        var emissive = vec3f(0.0);
        
        if (mat_id == 1) { // Wall
            base_col = vec3f(0.95, 0.9, 0.85); // Very clean cream/white stone
        } else if (mat_id == 2) { // Roof
            base_col = vec3f(0.5, 0.55, 0.65); // Clean light slate blue
        } else if (mat_id == 3) { // Window
            base_col = vec3f(0.1);
            if (tod > 0.6) {
                // Night time, turn on lights
                // Fading them out late at night
                let window_id = floor(p.xz) + floor(p.y);
                let turn_off_time = 0.7 + hash21(window_id) * 0.3;
                if (tod < turn_off_time) {
                    emissive = vec3f(1.0, 0.8, 0.4);
                }
            }
        } else if (mat_id == 4) { // Street
            base_col = vec3f(0.2);
        } else if (mat_id == 5) { // Trees
            base_col = vec3f(0.1, 0.35, 0.1); // Green foliage
        } else if (mat_id == 6) { // Smoke
            base_col = vec3f(0.45, 0.45, 0.5); // Cartoon grey smoke
        }
        
        // Atmosphere fog
        let fog = 1.0 - exp(-d * 0.005);
        
        let lit_col = base_col * (dif * vec3f(1.0, 0.9, 0.8) + amb * getSky(vec3f(0.0, 1.0, 0.0), tod, t)) + emissive;
        col = mix(lit_col, getSky(rd, tod, t), fog);
    }
    
    // Subtitle overlay (Canvas 2D)
    let textUV = block / res;
    let ov = textureSampleLevel( overlayTex, samp, textUV, 0.0 );
    var finalAlpha = ov.a;
    finalAlpha = max(0.0, (finalAlpha - 0.03) / 0.97);
    
    // Text dissolving based on uniform
    if (finalAlpha > 0.0) {
        let dissolveAlpha = u_view.z; // Subtitle dissolve is in u_view.z
        let dissolveNoise = fbm(textUV * 200.0 - t * 0.08);
        if (dissolveNoise > dissolveAlpha) {
            finalAlpha = 0.0;
        }
    }
    
    col = mix(col, ov.rgb, finalAlpha);

    return vec4f(col, 1.0);
}
