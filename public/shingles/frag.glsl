uniform vec2 res;
uniform vec4 u_view; // [pixelSize, timeOfDay, subtitleAlpha, time]
uniform sampler2D overlayTex;

// --- Helper Functions ---
mat2 rot2D(float angle) {
    float s = sin(angle); float c = cos(angle);
    return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
    vec2 p_ = fract(p * vec2(123.34, 456.21));
    p_ += dot(p_, p_ + 45.32);
    return fract(p_.x * p_.y);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f); 
    
    float a = hash21(i + vec2(0.0, 0.0));
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 x) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    vec2 p = x;
    for (int i = 0; i < 5; i++) {
        v += a * noise2D(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

// --- SDFs ---
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, vec3(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Global material tracking
int mat_id = 0;

float map(vec3 pos) {
    float d = 1000.0;
    
    float ground = pos.y + 0.0;
    
    vec2 cell = vec2(20.0, 30.0);
    
    vec3 p = pos;
    p.x = abs(p.x);
    p.x -= 15.0 + cell.x * 0.5; 
    
    float cell_idx_x = max(0.0, floor(p.x / cell.x + 0.5));
    float cell_idx_z = floor(p.z / cell.y + 0.5);
    
    p.x = p.x - cell_idx_x * cell.x;
    p.z = p.z - cell_idx_z * cell.y;
    
    vec2 id = vec2(cell_idx_x, cell_idx_z);
    
    float h_rand = 18.0 + hash21(id) * 1.0;
    float b_width = 7.5 + hash21(id + 1.0) * 0.5;
    float b_depth = 12.0;
    
    float base = sdBox(p - vec3(0.0, h_rand * 0.5, 0.0), vec3(b_width, h_rand * 0.5, b_depth));
    
    float cornice = sdBox(p - vec3(0.0, h_rand, 0.0), vec3(b_width + 0.3, 0.4, b_depth + 0.3));
    float base_with_cornice = min(base, cornice);
    
    vec3 rp = p - vec3(0.0, h_rand + 2.0, 0.0);
    float taper = clamp(rp.y / 4.0, 0.0, 1.0);
    float roof = sdBox(rp, vec3(b_width - taper*2.5, 2.0, b_depth - taper*2.5));
    
    vec3 cp = rp - vec3(b_width * 0.4, 2.0, b_depth * 0.5);
    float chimneys_all = sdBox(cp, vec3(0.8, 2.5, 1.5));
    
    float building = smin(base_with_cornice, min(roof, chimneys_all), 0.2);
    
    float smoke_d = 1000.0;
    if (hash21(id + 13.0) > 0.75) {
        float raw_t = u_view.w + hash21(id + 77.0) * 10.0;
        
        float gap = 0.0;
        if (hash21(id + 88.0) > 0.5) {
            gap = 0.5 + hash21(id + 101.0) * 1.5; 
        }
        float cycle = 1.0 + gap; 
        
        vec3 sp = cp - vec3(0.0, 2.5, 0.0); 
        
        for (int c = 0; c < 2; c++) {
            float fc = float(c);
            float time_val = raw_t * 0.08 + fc * 0.5; 
            
            float num_cycles = floor(time_val / cycle);
            float pt = time_val - num_cycles * cycle; 
            
            if (pt <= 1.0) {
                float h_center = pt * 15.0; 
                
                float overall_scale = sin(pt * 3.14159) * (1.0 + pt * 3.0);
                
                float center_x = sin(raw_t * 1.0 + fc * 10.0) * pt * 3.0;
                float center_z = cos(raw_t * 0.8 + fc * 10.0) * pt * 3.0;
                
                for (int i = 0; i < 4; i++) {
                    float fi = float(i);
                    
                    float offset_x = sin(fi * 2.4) * 0.9 * overall_scale;
                    float offset_y = (fi - 1.5) * 0.6 * overall_scale;
                    float offset_z = cos(fi * 2.4) * 0.9 * overall_scale;
                    
                    float r_puff = (0.75 + sin(fi) * 0.25) * overall_scale;
                    
                    vec3 puff_pos = sp - vec3(center_x + offset_x, h_center + offset_y, center_z + offset_z);
                    float puff = length(puff_pos) - r_puff;
                    
                    smoke_d = smin(smoke_d, puff, 0.8 * overall_scale + 0.2);
                }
            }
        }
    }
    
    vec3 tp = pos;
    tp.x = abs(tp.x) - 10.0; 
    tp.z = (fract(tp.z / 6.0 + 0.5) - 0.5) * 6.0; 
    float trees = length(tp - vec3(0.0, 5.0, 0.0)) - (3.0 + fbm(pos.xz * 1.5) * 0.8);
    
    // Carriages — use world space pos, not building-shifted p
    vec3 cp_p = pos;
    float lane = sign(cp_p.x);
    if (lane == 0.0) lane = 1.0;
    cp_p.x = abs(cp_p.x) - 3.5; 
    
    float c_spacing = 45.0;
    float speed = 25.0;
    cp_p.z += u_view.w * speed * lane; 
    
    float c_id = floor(cp_p.z / c_spacing + 0.5);
    cp_p.z = fract(cp_p.z / c_spacing + 0.5) - 0.5;
    cp_p.z *= c_spacing;
    
    cp_p.z *= -lane; // Forward is +Z
    
    // Randomize
    if (hash21(vec2(c_id, lane)) < 0.2) cp_p.y += 100.0;
    
    float cab = sdBox(cp_p - vec3(0.0, 2.5, 0.0), vec3(1.2, 1.5, 2.0));
    float roof_cab = sdBox(cp_p - vec3(0.0, 4.0, 0.0), vec3(1.4, 0.1, 2.2));
    float seat = sdBox(cp_p - vec3(0.0, 2.2, 2.3), vec3(0.9, 0.2, 0.6)); 
    
    vec3 wp = cp_p - vec3(0.0, 1.0, 0.0);
    wp.x = abs(wp.x) - 1.3;
    wp.z = abs(wp.z) - 1.2;
    float wheels = sdBox(wp, vec3(0.1, 1.0, 1.0));
    
    float horse_body = sdBox(cp_p - vec3(0.0, 1.8, 5.0), vec3(0.5, 0.7, 1.4));
    float horse_head = sdBox(cp_p - vec3(0.0, 2.8, 6.2), vec3(0.25, 0.5, 0.4));
    float horse = smin(horse_body, horse_head, 0.3); 
    
    float carriage = min(min(cab, roof_cab), min(seat, min(wheels, horse)));
    
    // Gas lamp posts along the sidewalks
    vec3 lp = pos;
    lp.x = abs(lp.x) - 8.5; // Position on sidewalk edge
    lp.z = (fract(lp.z / 20.0 + 0.5) - 0.5) * 20.0; // Repeat every 20 units
    float lamp_pole = sdBox(lp - vec3(0.0, 3.0, 0.0), vec3(0.15, 3.0, 0.15));
    float lamp_head = sdBox(lp - vec3(0.0, 6.2, 0.0), vec3(0.4, 0.5, 0.4));
    float lamp_top  = sdBox(lp - vec3(0.0, 6.8, 0.0), vec3(0.5, 0.1, 0.5));
    float lamp = min(lamp_pole, min(lamp_head, lamp_top));
    
    if (ground < d) { d = ground; mat_id = 4; }
    if (building < d) { 
        d = building; 
        if (roof < base_with_cornice && roof < chimneys_all) { mat_id = 2; }
        else { mat_id = 1; }
    }
    if (trees < d) { d = trees; mat_id = 5; }
    if (smoke_d < d) { d = smoke_d; mat_id = 6; }
    if (carriage < d) { d = carriage; mat_id = 7; }
    if (lamp < d) { d = lamp; mat_id = 8; }
    
    return d;
}

vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}

vec3 getSunDir(float tod) {
    float sun_progress = clamp(tod / 0.95, 0.0, 1.0); // Sun sets fully at 95%
    float sun_x = mix(-1.2, 1.2, sun_progress);
    
    // Parabolic arc so the sun starts and ends definitively below the horizon
    float x_arc = mix(-1.0, 1.0, sun_progress);
    float sun_y = (1.0 - x_arc * x_arc) * 0.6 - 0.2; 
    
    return normalize(vec3(sun_x, sun_y, 1.5));
}

vec3 getAtmosphere(vec3 rd, float tod, float t) {
    vec3 sun_dir = getSunDir(tod);
    
    // Determine sky colors based on sun height
    vec3 day_zenith = vec3(0.1, 0.3, 0.6);
    vec3 day_horizon = vec3(0.6, 0.75, 0.9);
    
    vec3 sunset_zenith = vec3(0.2, 0.2, 0.4);
    vec3 sunset_horizon = vec3(0.9, 0.4, 0.2);
    
    vec3 night_zenith = vec3(0.01, 0.02, 0.05);
    vec3 night_horizon = vec3(0.02, 0.05, 0.1);
    
    // Mix day to sunset (sun_dir.y from 0.3 down to 0.0)
    float day_to_sunset = smoothstep(0.3, 0.0, sun_dir.y);
    vec3 current_zenith = mix(day_zenith, sunset_zenith, day_to_sunset);
    vec3 current_horizon = mix(day_horizon, sunset_horizon, day_to_sunset);
    
    // Mix sunset to night (sun_dir.y from 0.0 down to -0.15)
    float sunset_to_night = smoothstep(0.0, -0.15, sun_dir.y);
    current_zenith = mix(current_zenith, night_zenith, sunset_to_night);
    current_horizon = mix(current_horizon, night_horizon, sunset_to_night);
    
    // Final sky gradient based on view direction (rd.y)
    vec3 sky = mix(current_horizon, current_zenith, smoothstep(0.0, 1.0, rd.y));
    
    // Add Stars
    vec3 sky_col = sky;
    float night_fade = smoothstep(0.8, 1.0, tod);
    if (night_fade > 0.0) {
        // Rotate rd.xy based on time of day to simulate celestial rotation
        vec2 star_pos = rot2D(-tod * 1.5) * rd.xy;
        float star_val = noise2D(star_pos * 200.0 + rd.z * 50.0);
        float stars = pow(star_val, 15.0) * 2.0;
        sky_col += stars * night_fade * max(0.0, rd.y);
    }
    
    return sky_col;
}

vec3 addSun(vec3 bg, vec3 rd, vec3 sun_dir, float tod) {
    float sun_dot = dot(rd, sun_dir);
    if (sun_dot > 0.0) {
        float sun_disc = smoothstep(0.9995, 0.9998, sun_dot); 
        float sun_glow = smoothstep(0.92, 0.9995, sun_dot); 
        
        vec3 sun_color = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.9, 0.6), smoothstep(-0.05, 0.3, sun_dir.y));
        
        // Ensure sun and glow fade out entirely when fully below horizon
        float horizon_mask = smoothstep(-0.15, -0.05, sun_dir.y);
        
        bg += sun_color * sun_glow * 0.15 * horizon_mask; 
        bg = mix(bg, vec3(1.0, 0.98, 0.9), sun_disc * horizon_mask);
    }
    return bg;
}

float mapClouds(vec3 local_p) {
    vec2 cell = vec2(150.0, 150.0);
    vec2 id = floor(local_p.xz / cell + 0.5);
    local_p.xz = local_p.xz - id * cell;
    
    float d_cloud = 1000.0;
    if (hash21(id + 42.0) > 0.5) {
        float c_scale = 0.8 + hash21(id + 22.0) * 1.8; // More scale variation
        for (int i = 0; i < 15; i++) { // 15 small puffs for a fluffy grouping
            float fi = float(i);
            float angle = hash21(id + fi * 11.0) * 6.28;
            float dist = sqrt(hash21(id + fi * 17.0)) * 40.0 * c_scale;
            
            float cx = cos(angle) * dist;
            float cz = sin(angle) * dist;
            float cy = (hash21(id + fi * 31.0) - 0.5) * 6.0 * c_scale;
            
            float rad = (6.0 + hash21(id + fi * 51.0) * 10.0) * c_scale;
            
            vec3 p_diff = local_p - vec3(cx, 110.0 + cy, cz);
            p_diff.y *= 1.5; 
            
            float puff = (length(p_diff) - rad) * 0.6; 
            
            if (i == 0) {
                d_cloud = puff;
            } else {
                d_cloud = smin(d_cloud, puff, 5.0 * c_scale);
            }
        }
    } else {
        d_cloud = 30.0; 
    }
    return d_cloud;
}

vec3 addEiffelTower(vec3 bg, vec3 rd) {
    vec3 e_dir = normalize(vec3(0.0, 0.0, 1.0)); 
    float e_dot = dot(vec3(rd.x, 0.0, rd.z), vec3(e_dir.x, 0.0, e_dir.z));
    if (e_dot > 0.99 && rd.y > -0.2) {
        float dx = abs(rd.x * 25.0);
        float dy = (rd.y + 0.18) * 3.0; 
        
        bool is_tower = false;
        float w_scale = 2.0;
        
        if (dy > 0.0 && dy < 0.2) {
            float width = (0.8 - dy * 1.5) * w_scale; 
            if (dx < width) {
                if (dx > (0.5 - dy * 2.5) * w_scale) {
                    is_tower = true;
                }
            }
        }
        else if (dy >= 0.2 && dy < 0.22) {
            if (dx < 0.55 * w_scale) { is_tower = true; }
        }
        else if (dy >= 0.22 && dy < 0.5) {
            float width = (0.45 - (dy - 0.22) * 0.8) * w_scale;
            if (dx < width) { is_tower = true; }
        }
        else if (dy >= 0.5 && dy < 0.52) {
            if (dx < 0.28 * w_scale) { is_tower = true; }
        }
        else if (dy >= 0.52 && dy < 1.0) {
            float width = (0.18 - (dy - 0.52) * 0.3) * w_scale;
            if (dx < width) { is_tower = true; }
        }
        else if (dy >= 1.0 && dy < 1.1) {
            if (dx < 0.02 * w_scale) { is_tower = true; }
        }

        if (is_tower) {
            bool is_deck = (dy >= 0.2 && dy < 0.22) || (dy >= 0.5 && dy < 0.52) || dy >= 1.0;
            if (!is_deck) {
                float current_width = 0.0;
                if (dy > 0.0 && dy < 0.2) {
                    current_width = (0.8 - dy * 1.5) * w_scale;
                } else if (dy >= 0.22 && dy < 0.5) {
                    current_width = (0.45 - (dy - 0.22) * 0.8) * w_scale;
                } else if (dy >= 0.52 && dy < 1.0) {
                    current_width = (0.18 - (dy - 0.52) * 0.3) * w_scale;
                }

                float current_inner = 0.0;
                if (dy > 0.0 && dy < 0.2) {
                    current_inner = (0.5 - dy * 2.5) * w_scale;
                }
                
                float margin = 0.08;
                if (dx < current_width - margin && dx > current_inner + margin) {
                    bool check_x = fract(dx * 12.0) > 0.5;
                    bool check_y = fract(dy * 12.0) > 0.5;
                    if (check_x == check_y) {
                        is_tower = false; 
                    }
                }
            }
            
            if (is_tower) {
                bg = mix(bg, vec3(0.1, 0.1, 0.12), 0.85); 
            }
        }
    }
    return bg;
}

void main() {
    float t = u_view.w;
    float tod = u_view.y; 
    
    float ps = max(u_view.x, 1.0);
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 block = floor(fragCoord / ps) * ps + ps * 0.5;
    
    vec2 uv = block / res; 
    vec2 textUV = uv;
    // Removed textUV.y flip since CanvasTexture flipY is true by default
    
    uv = uv * 2.0 - 1.0; 
    
    float aspect = res.x / res.y;
    vec2 uv_aspect = vec2(uv.x * aspect, uv.y);
    
    vec3 ro = vec3(0.0, 35.0, 0.0); 
    vec3 rd = normalize(vec3(uv_aspect, 1.5));
    
    vec3 p = ro;
    float d = 0.0;
    bool hit = false;
    
    for (int i = 0; i < 130; i++) {
        float sd = map(p);
        if (sd < 0.01) { hit = true; break; }
        if (d > 400.0) { break; }
        d += sd;
        p = ro + rd * d;
    }
    
    vec3 sun_dir = getSunDir(tod);
    vec3 atmos = getAtmosphere(rd, tod, t);
    bool c_hit = false;
    float c_d = 0.0;
    float cloud_fog = 0.0;
    vec3 col = vec3(0.0);
    
    if (hit) {
        vec3 n = calcNormal(p);
        
        // Dynamic shading using the actual sun direction
        // Stop lighting up vertical walls when the sun drops below the horizon
        float horizon_light_mask = smoothstep(-0.05, 0.05, sun_dir.y);
        float dif = max(0.0, dot(n, sun_dir)) * horizon_light_mask;
        float amb = 0.25 + max(0.0, n.y) * 0.25; // Boost ambient to make streets visible
        
        vec3 base_col = vec3(0.5); 
        vec3 emissive = vec3(0.0);
        
        if (mat_id == 1) { 
            // Per-building warm tone variation (cream, sandstone, pale ochre)
            vec2 b_cell = vec2(15.0, 25.0);
            vec2 b_id = floor(p.xz / b_cell + 0.5);
            float tone_hash = hash21(b_id + 7.7);
            vec3 wall_cream = vec3(0.95, 0.9, 0.82);
            vec3 wall_sand  = vec3(0.92, 0.85, 0.72);
            vec3 wall_ochre = vec3(0.88, 0.82, 0.7);
            base_col = mix(wall_cream, mix(wall_sand, wall_ochre, tone_hash), tone_hash);
            
            // Procedural brick/stone texture on walls
            vec2 brick_uv = p.yz * vec2(1.0, 0.5);
            brick_uv.x += step(1.0, mod(floor(brick_uv.y), 2.0)) * 0.5; // Offset every other row
            vec2 brick_id = floor(brick_uv);
            vec2 brick_f = fract(brick_uv);
            float mortar = step(0.06, brick_f.x) * step(0.06, brick_f.y);
            float brick_shade = 0.92 + hash21(brick_id) * 0.08;
            base_col *= mix(0.7, brick_shade, mortar); // Mortar lines are darker
            
            vec2 cell = vec2(15.0, 25.0);
            vec2 id = floor(p.xz / cell + 0.5);
            vec3 local_p = p;
            local_p.xz -= id * cell;
            
            // Outer houses (id.x == +/-1), facing the road (normals point opposite to id.x)
            if (abs(id.x) == 1.0 && sign(n.x) == -sign(id.x) && abs(n.x) > 0.5) {
                float h_rand = 18.0 + hash21(id) * 1.0;
                float total_h = h_rand; // The actual height of the building box
                float b_depth = 12.0;
                
                // 3 columns spanning the EXACT 24 unit depth of the building wall (z from -12 to 12)
                float col_w = (b_depth * 2.0) / 3.0; 
                float win_u = fract((local_p.z + b_depth) / col_w) - 0.5;
                float win_col = floor((local_p.z + b_depth) / col_w);
                
                // 4 rows spanning the EXACT vertical height of the wall (y from 0 to total_h)
                float row_h = total_h / 4.0; 
                float win_v = fract(local_p.y / row_h) - 0.5;
                float win_row = floor(local_p.y / row_h);
                
                // Ensure we are inside the 3x4 grid bounds
                if (win_col >= 0.0 && win_col < 3.0 && win_row >= 0.0 && win_row < 4.0) {
                    // Victorian proportions (tall and narrow)
                    float frame_w = 0.15; 
                    float frame_h = 0.35;
                    float glass_w = 0.12;
                    float glass_h = 0.31;
                    
                    if (abs(win_u) < frame_w && abs(win_v) < frame_h) {
                        bool is_glass = abs(win_u) < glass_w && abs(win_v) < glass_h;
                        
                        // Add Victorian crossbars (mullions)
                        if (abs(win_v) < 0.015) is_glass = false; // Horizontal bar
                        if (abs(win_u) < 0.015) is_glass = false; // Vertical bar
                        
                        if (is_glass) {
                            vec3 window_day = vec3(0.05, 0.1, 0.15); 
                            vec3 window_night = vec3(1.0, 0.6, 0.1); 
                            float night_glow = smoothstep(-0.05, -0.15, sun_dir.y); 
                            
                            float win_id = win_col + win_row * 10.0;
                            float win_hash = hash21(id + vec2(win_id, 1.33));
                            if (win_hash > 0.3) {
                                base_col = mix(window_day, window_night, night_glow);
                                emissive = mix(vec3(0.0), window_night * 2.0, night_glow); 
                            } else {
                                base_col = window_day;
                            }
                        } else {
                            // Dark wrought iron / painted wood frame
                            base_col = vec3(0.2, 0.2, 0.22); 
                            
                            // Bottom sill (light stone accent)
                            if (win_v < -glass_h) {
                                base_col = vec3(0.7, 0.65, 0.6); 
                            }
                            // Top cornice/arch accent over the window
                            if (win_v > glass_h) {
                                base_col = vec3(0.8, 0.75, 0.7);
                            }
                        }
                    }
                }
            }
        } else if (mat_id == 2) { 
            // Roof with procedural shingle/slate pattern — the title of the piece
            vec2 shingle_uv = p.xz * vec2(0.8, 1.2);
            shingle_uv.x += step(1.0, mod(floor(shingle_uv.y), 2.0)) * 0.5;
            vec2 sh_id = floor(shingle_uv);
            vec2 sh_f = fract(shingle_uv);
            float sh_edge = step(0.04, sh_f.x) * step(0.04, sh_f.y);
            float sh_tone = 0.48 + hash21(sh_id) * 0.15;
            base_col = vec3(sh_tone, sh_tone + 0.05, sh_tone + 0.12) * sh_edge;
            base_col = mix(vec3(0.3, 0.32, 0.38), base_col, sh_edge); // Dark gaps between shingles
        } else if (mat_id == 4) {
            // Cobblestone streets — every stone the same, yet each slightly different
            vec2 cobble_uv = p.xz * 0.6;
            cobble_uv.x += step(1.0, mod(floor(cobble_uv.y), 2.0)) * 0.5;
            vec2 cobble_id = floor(cobble_uv);
            vec2 cobble_f = fract(cobble_uv) - 0.5;
            float cobble_dist = max(abs(cobble_f.x), abs(cobble_f.y));
            float cobble_edge = smoothstep(0.48, 0.42, cobble_dist); // Rounded rectangle per stone
            float cobble_tone = 0.2 + hash21(cobble_id) * 0.12;
            base_col = vec3(cobble_tone) * cobble_edge + vec3(0.1) * (1.0 - cobble_edge);
        } else if (mat_id == 5) { 
            base_col = vec3(0.15, 0.4, 0.15); // Brighter trees
        } else if (mat_id == 6) { 
            base_col = vec3(0.5); // Smoke base color
            float pt = min(t, 1.0);
            emissive = mix(vec3(0.0), vec3(0.1, 0.1, 0.15), smoothstep(0.0, -0.15, sun_dir.y));
        } else if (mat_id == 7) { 
            // Dark wood/leather carriage with per-instance color variety
            float c_lane = sign(p.x);
            if (c_lane == 0.0) c_lane = 1.0;
            vec3 c_lp = p;
            c_lp.x = abs(c_lp.x) - 3.5;
            c_lp.z += u_view.w * 25.0 * c_lane;
            float c_cid = floor(c_lp.z / 45.0 + 0.5);
            float c_tone = hash21(vec2(c_cid, c_lane + 5.0));
            vec3 carriage_dark = vec3(0.08, 0.04, 0.02);
            vec3 carriage_wine = vec3(0.15, 0.03, 0.03);
            vec3 carriage_navy = vec3(0.04, 0.04, 0.1);
            base_col = mix(carriage_dark, mix(carriage_wine, carriage_navy, c_tone), c_tone);
            
            // Recompute carriage local coords for lantern
            vec3 cp_p = p;
            float lane = sign(cp_p.x);
            if (lane == 0.0) lane = 1.0;
            cp_p.x = abs(cp_p.x) - 3.5; 
            float speed = 25.0;
            cp_p.z += u_view.w * speed * lane; 
            float c_spacing = 45.0;
            cp_p.z = fract(cp_p.z / c_spacing + 0.5) - 0.5;
            cp_p.z *= c_spacing;
            cp_p.z *= -lane;
            
            // Add a glowing lantern on the sides of the cabin
            if (abs(cp_p.x) > 1.15 && cp_p.y > 2.5 && cp_p.y < 3.2 && abs(cp_p.z) < 0.4) {
                base_col = vec3(1.0, 0.8, 0.2);
                float night_glow = smoothstep(0.0, -0.15, sun_dir.y);
                emissive = mix(vec3(0.0), vec3(1.0, 0.6, 0.1) * 3.0, night_glow);
            }
        } else if (mat_id == 8) {
            // Gas lamp posts — wrought iron pole, glowing head at night
            base_col = vec3(0.12, 0.1, 0.08); // Dark iron
            
            // Lamp head glows warm at night
            vec3 lamp_lp = p;
            lamp_lp.x = abs(lamp_lp.x) - 8.5;
            lamp_lp.z = (fract(lamp_lp.z / 20.0 + 0.5) - 0.5) * 20.0;
            if (lamp_lp.y > 5.8 && lamp_lp.y < 6.8) {
                float night_glow = smoothstep(0.0, -0.15, sun_dir.y);
                base_col = mix(vec3(0.12, 0.1, 0.08), vec3(1.0, 0.8, 0.3), night_glow);
                emissive = mix(vec3(0.0), vec3(1.0, 0.6, 0.1) * 4.0, night_glow);
            }
        }
        
        float fog = 1.0 - exp(-d * 0.004); // Slightly softer Parisian haze
        
        // Ambient light takes on the atmosphere color
        vec3 amb_light = getAtmosphere(vec3(0.0, 1.0, 0.0), tod, t);
        // Boost directional light intensity massively so the sun hits the streets and buildings hard
        vec3 directional_light = dif * vec3(2.5, 2.2, 1.8);
        vec3 lit_col = base_col * (directional_light + amb * amb_light) + emissive;
        
        // Fog blends to the atmosphere, so buildings are layered IN FRONT of the sun
        col = mix(lit_col, atmos, fog);
        
    } else {
        col = atmos;
        col = addSun(col, rd, sun_dir, tod);
        col = addEiffelTower(col, rd);
        
        // Optimized 3D Volumetric Cloud Raymarch
        if (rd.y > 0.02) {
            float t_in = max(0.0, (80.0 - ro.y) / rd.y);
            float t_out = (150.0 - ro.y) / rd.y;
            c_d = t_in;
            vec3 cp = vec3(0.0);
            for (int j = 0; j < 40; j++) {
                cp = ro + rd * c_d;
                vec3 local_p = cp;
                local_p.x -= t * 3.0; 
                local_p.z -= t * 2.0; 
                
                float d_cloud = mapClouds(local_p);
                
                if (d_cloud < 0.1) { c_hit = true; break; }
                c_d += max(d_cloud, 0.5); 
                if (c_d > t_out) break;
            }
            
            if (c_hit) {
                float h_factor = smoothstep(90.0, 140.0, cp.y);
                
                // Dynamic cloud diffuse lighting based on sun height
                float c_dif = clamp(0.5 + 0.5 * sun_dir.y, 0.0, 1.0);
                vec3 cloud_base = vec3(0.4, 0.4, 0.45);
                vec3 cloud_lit = vec3(1.0, 1.0, 1.0);
                vec3 cloud_col = mix(cloud_base, cloud_lit, c_dif * h_factor);
                
                // Backlight the clouds when they pass in front of the sun
                float s_dot = dot(rd, sun_dir);
                if (s_dot > 0.0) {
                    float s_glow = smoothstep(0.95, 1.0, s_dot);
                    vec3 glow_color = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.9, 0.6), smoothstep(-0.05, 0.3, sun_dir.y));
                    cloud_col += glow_color * s_glow * 0.8;
                }
                
                cloud_fog = 1.0 - exp(-c_d * 0.003);
                col = mix(cloud_col, col, cloud_fog);
            }
        }
    }
    
    // Procedural God Rays (Light Shafts)
    float s_dot_rays = dot(rd, sun_dir);
    if (s_dot_rays > 0.0) {
        
        // Evaluate angular sun occlusion by sampling clouds around the sun's disc
        float ray_intensity_mult = 1.0;
        
        vec3 sun_tangent = normalize(cross(sun_dir, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 sun_bitangent = cross(sun_tangent, sun_dir);
        
        float x_proj = dot(rd, sun_tangent);
        float y_proj = dot(rd, sun_bitangent);
        float angle = atan(y_proj, x_proj);
        
        if (sun_dir.y > 0.02) {
            float d_sun = (110.0 - ro.y) / sun_dir.y;
            vec3 sun_p = ro + sun_dir * d_sun;
            sun_p.x -= t * 3.0;
            sun_p.z -= t * 2.0;
            
            // Sample cloud at an offset from the sun in the direction of this specific ray
            // This causes clouds to cast accurate volumetric shadow rays!
            float offset_dist = 25.0; // Distance to sample outward from the sun center
            vec3 sample_p = sun_p + (sun_tangent * cos(angle) + sun_bitangent * sin(angle)) * offset_dist;
            
            float sun_cloud_d = mapClouds(sample_p);
            ray_intensity_mult = 1.0 - smoothstep(15.0, -5.0, sun_cloud_d);
        }
        
        if (ray_intensity_mult > 0.01) {
            float ray_noise = fbm(vec2(angle * 20.0, t * 0.08)); 
            float ray_intensity = smoothstep(0.5, 0.9, ray_noise);
            
            // Increase the exponent to make rays fall off faster (shorter rays)
            float ray_fade = pow(s_dot_rays, 45.0); 
            float time_fade = smoothstep(-0.1, 0.2, sun_dir.y);
            
            float ray_depth_fade = 1.0;
            if (hit) {
                ray_depth_fade = 1.0 - exp(-d * 0.005); 
            }
            if (c_hit) {
                // cloud_fog is transmittance (0 = solid cloud, 1 = transparent sky)
            ray_depth_fade *= cloud_fog; 
        }
        
        vec3 ray_color = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.9, 0.7), time_fade);
        
        // Fade OUT the entire ray when the sun is below horizon
        float horizon_fade = smoothstep(-0.15, -0.05, sun_dir.y);
        
        col += ray_color * ray_intensity * ray_fade * 0.18 * ray_depth_fade * ray_intensity_mult * horizon_fade;
    }
    }
    
    vec4 ov = texture2D(overlayTex, textUV);
    float finalAlpha = ov.a;
    finalAlpha = max(0.0, (finalAlpha - 0.03) / 0.97);
    
    if (finalAlpha > 0.0) {
        float dissolveAlpha = u_view.z; 
        float dissolveNoise = fbm(textUV * 200.0 - vec2(t * 0.08));
        if (dissolveNoise > dissolveAlpha) {
            finalAlpha = 0.0;
        }
    }
    
    col = mix(col, ov.rgb, finalAlpha);
    
    // --- Post-processing ---
    
    // Warm sepia color grading — push toward period amber tones
    col = pow(col, vec3(0.92, 0.96, 1.08));
    
    // Vignette — darken edges to draw the eye to the vanishing point
    vec2 vig_uv = gl_FragCoord.xy / res - 0.5;
    float vig = 1.0 - dot(vig_uv, vig_uv) * 1.2;
    vig = clamp(vig, 0.0, 1.0);
    col *= vig;
    
    // Film grain — subtle animated grain for painterly quality
    float grain = (hash21(gl_FragCoord.xy + fract(t * 37.0) * 100.0) - 0.5) * 0.06;
    col += grain;
    
    gl_FragColor = vec4(col, 1.0);
}
