@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<storage> waterState: array<vec2f>;
@group(0) @binding(3) var<uniform> u_view:   vec4f; 
@group(0) @binding(4) var<uniform> u_player: vec4f; 
@group(0) @binding(5) var<uniform> u_npc:    vec4f; 
@group(0) @binding(6) var<uniform> u_pcol:   vec4f; 
@group(0) @binding(7) var<uniform> u_ncol:     vec4f;
@group(0) @binding(8) var<uniform> u_room:     vec4f;
@group(0) @binding(9) var<uniform> u_room_idx: vec4f;
@group(0) @binding(10) var samp: sampler;
@group(0) @binding(11) var overlayTex: texture_2d<f32>;
@group(0) @binding(12) var<uniform> u_anim:    vec4f;
@group(0) @binding(13) var<uniform> u_subtitle: vec4f;

const WATER_START_DEPTH  : f32 = 0.55;  

const FLOOR_COL          : vec3f = vec3f( 0.995, 0.997, 1.000 );
const LEFT_WALL_TOP      : vec3f = vec3f( 0.910, 0.920, 0.940 );
const LEFT_WALL_BOT      : vec3f = vec3f( 0.815, 0.830, 0.870 );
const RIGHT_WALL_TOP     : vec3f = vec3f( 0.960, 0.970, 0.985 );
const RIGHT_WALL_BOT     : vec3f = vec3f( 0.880, 0.895, 0.920 );
const BASEBOARD_COL      : vec3f = vec3f( 0.580, 0.605, 0.660 );
const HALLWAY_COL        : vec3f = vec3f( 0.700, 0.720, 0.760 );

fn hash21( p: vec2f ) -> f32 {
    var p3 = fract( vec3f( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

fn vnoise( p: vec2f ) -> f32 {
    let i = floor( p );
    let f = fract( p );
    let w = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21(i), hash21(i + vec2f(1.0, 0.0)), w.x ), 
                mix( hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), w.x ), w.y );
}

fn fbm( p: vec2f ) -> f32 {
    var v = 0.0; var a = 0.5; var pp = p;
    for( var i = 0; i < 4; i++ ) { v += a * vnoise( pp ); pp *= 2.0; a *= 0.5; }
    return v;
}

fn simH( px: i32, py: i32 ) -> f32 {
    let r = vec2i( res );
    let cx = clamp( px, 0, r.x - 1 );
    let cy = clamp( py, 0, r.y - 1 );
    return waterState[ u32( cy * r.x + cx ) ].x;
}

fn getUV(screen: vec2f, cx: f32, cy: f32, rx: f32, ry: f32) -> vec2f {
    let dx = (screen.x - cx) / rx;
    let dy = (screen.y - cy) / ry;
    return vec2f( (dy + dx) * 0.5, (dy - dx) * 0.5 );
}

fn getScreen(p: vec3f, cx: f32, cy: f32, rx: f32, ry: f32) -> vec2f {
    return vec2f( cx + (p.x - p.z) * rx, cy + (p.x + p.z) * ry - p.y * ry );
}

fn sdBox(p: vec3f, b: vec3f) -> f32 {
    let q = abs(p) - b;
    return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp( 0.5 + 0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}

fn sdCapsule(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
    let pa = p - a; let ba = b - a;
    let h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
    return length(pa - ba*h) - r;
}

struct MapRes { d: f32, mat: i32, col: vec3f, }
fn opU(m1: MapRes, m2: MapRes) -> MapRes { if (m1.d < m2.d) { return m1; } return m2; }

fn sdCharacter(p: vec3f, pos: vec2f, h: f32, anim: vec4f) -> f32 {
    let wH = h / (res.y * 0.35);
    let walkPhase = anim.x;
    let facing = 1.5708 - anim.y; // Correct rotation mapping (PI/2 - atan2)
    let jumpH = anim.z * wH * 3.0; // scale jump up a bit
    
    let bob = sin(walkPhase * 2.0) * wH * 0.03;
    let feet = vec3f(pos.x, bob + jumpH, pos.y);
    let baseRaw = p - feet;
    
    // Rotate character
    let c = cos(facing); let s = sin(facing);
    let base = vec3f(baseRaw.x * c - baseRaw.z * s, baseRaw.y, baseRaw.x * s + baseRaw.z * c);
    
    let swingArm = sin(walkPhase) * wH * 0.15;
    let swingLeg = sin(walkPhase) * wH * 0.12;
    
    let body = sdCapsule(base, vec3f(0.0, wH*0.2, 0.0), vec3f(0.0, wH*0.7, 0.0), wH*0.1);
    let head = length(base - vec3f(0.0, wH*0.9, 0.0)) - wH*0.15;
    let armL = sdCapsule(base, vec3f(0.0, wH*0.65, 0.0), vec3f(-wH*0.15, wH*0.3, -wH*0.05 + swingArm), wH*0.04);
    let armR = sdCapsule(base, vec3f(0.0, wH*0.65, 0.0), vec3f(wH*0.15, wH*0.3, wH*0.05 - swingArm), wH*0.04);
    let legL = sdCapsule(base, vec3f(0.0, wH*0.2, 0.0), vec3f(-wH*0.08, 0.0, -wH*0.05 - swingLeg), wH*0.05);
    let legR = sdCapsule(base, vec3f(0.0, wH*0.2, 0.0), vec3f(wH*0.08, 0.0, wH*0.05 + swingLeg), wH*0.05);
    
    return min(min(min(body, head), min(armL, armR)), min(legL, legR));
}

fn map(p: vec3f, t: f32, room_idx: i32, cx: f32, cy: f32, rx: f32, ry: f32, block: vec2f) -> MapRes {
    var res_map = MapRes(1000.0, -1, vec3f(0.0));
    
    var dFloor = p.y;
    if (room_idx == 3) {
        let pRot = vec3f((p.x + p.z)*0.7071, p.y, (p.x - p.z)*0.7071);
        let chasmW = 0.06 + min(u_anim.w * 0.015, 0.12);
        let dChasm = sdBox(pRot - vec3f(0.7071, 0.0, 0.0), vec3f(chasmW, 10.0, 10.0));
        dFloor = max(p.y, -dChasm);
    } else if (room_idx == 2) {
        var h1 = length(p.xz - vec2f(0.4, 0.3)) - 0.08;
        var h2 = length(p.xz - vec2f(0.6, 0.7)) - 0.08;
        var h3 = length(p.xz - vec2f(0.3, 0.6)) - 0.08;
        var h4 = length(p.xz - vec2f(0.7, 0.3)) - 0.08;
        let saveProgress = u_room_idx.y;
        var h5 = length(p.xz - u_npc.xy) - (saveProgress * 0.15); // Hole opens under NPC
        let holes = min(min(min(h1, h2), min(h3, h4)), h5);
        dFloor = max(p.y, -holes);
    }
    
    var isHallway = p.x > 0.85 && p.x < 1.3 && p.z > 0.85 && p.z < 1.3 && room_idx < 8;
    var bounds = sdBox(p - vec3f(0.65, -1.0, 0.65), vec3f(0.65, 1.0, 0.65));
    if (isHallway) { bounds = min(bounds, sdBox(p - vec3f(1.0, -1.0, 1.0), vec3f(0.3, 1.0, 0.3))); }
    dFloor = max(dFloor, bounds);
    res_map = opU(res_map, MapRes(dFloor, 0, vec3f(0.0)));
    
    var dWallL = sdBox(p - vec3f(-0.1, 1.0, 0.65), vec3f(0.1, 1.0, 0.65));
    if (room_idx == 7) {
        let windowHole = sdBox(p - vec3f(-0.05, 0.5, 0.5), vec3f(0.15, 0.15, 0.15));
        dWallL = max(dWallL, -windowHole);
        let windowPane = sdBox(p - vec3f(-0.05, 0.5, 0.5), vec3f(0.02, 0.14, 0.14));
        res_map = opU(res_map, MapRes(windowPane, 8, vec3f(0.0)));
    }
    res_map = opU(res_map, MapRes(dWallL, 1, vec3f(0.0)));
    
    let dWallR = sdBox(p - vec3f(0.65, 1.0, -0.1), vec3f(0.65, 1.0, 0.1));
    res_map = opU(res_map, MapRes(dWallR, 2, vec3f(0.0)));
    
    let dBaseL = sdBox(p - vec3f(-0.02, 0.02, 0.65), vec3f(0.02, 0.02, 0.65));
    let dBaseR = sdBox(p - vec3f(0.65, 0.02, -0.02), vec3f(0.65, 0.02, 0.02));
    res_map = opU(res_map, MapRes(min(dBaseL, dBaseR), 3, vec3f(0.0)));
    
    let dPlayer = sdCharacter(p, u_player.xy, u_room.x, u_anim);
    res_map = opU(res_map, MapRes(dPlayer, 4, u_pcol.rgb));
    
    let dNpc = sdCharacter(p, u_npc.xy, u_room.z, vec4f(0.0));
    res_map = opU(res_map, MapRes(dNpc, 5, u_ncol.rgb));

    if (room_idx == 0) {
        var photoFrame = sdBox(p - vec3f(0.0, 0.45, 0.5), vec3f(0.015, 0.15, 0.15));
        if (photoFrame < res_map.d) {
            var photoCanvas = sdBox(p - vec3f(0.01, 0.45, 0.5), vec3f(0.01, 0.13, 0.13));
            if (photoCanvas < 0.01) {
                if (distance(p.yz, vec2f(0.45, 0.46)) < 0.05) { res_map = MapRes(photoFrame, 6, vec3f(0.62, 0.78, 1.00)); }
                else if (distance(p.yz, vec2f(0.45, 0.54)) < 0.05) { res_map = MapRes(photoFrame, 6, vec3f(0.016, 0.063, 0.122)); }
                else { res_map = MapRes(photoFrame, 6, vec3f(0.9, 0.9, 0.92)); }
            } else { res_map = MapRes(photoFrame, 6, vec3f(0.15, 0.16, 0.18)); }
        }
    }
    if (room_idx == 1) {
        var piano = sdBox(p - vec3f(0.15, 0.025, 0.15), vec3f(0.1, 0.025, 0.1));
        if (piano < res_map.d) {
             if (p.x > 0.18 && p.z < 0.25 && p.y > 0.04) { res_map = MapRes(piano, 6, vec3f(0.9)); } 
             else { res_map = MapRes(piano, 6, vec3f(0.1, 0.1, 0.12)); }
        }
    }
    if (room_idx == 4) {
        let dRing = length(vec2f(length(p.xz - vec2f(0.5, 0.5)) - 0.08, p.y - 0.01)) - 0.015;
        res_map = opU(res_map, MapRes(dRing, 6, vec3f(0.2, 0.2, 0.22)));
        
        let saveProgress = u_room_idx.y;
        if (saveProgress > 0.01) {
            let pLocal = p - vec3f(0.5, 0.0, 0.5);
            let fH = saveProgress * 1.5;
            let s1 = length(pLocal - vec3f(sin(t*12.0)*0.01, 0.05 * fH, cos(t*14.0)*0.01)) - 0.05 * saveProgress;
            let s2 = length(pLocal - vec3f(sin(t*15.0)*0.02, 0.11 * fH, cos(t*13.0)*0.02)) - 0.03 * saveProgress;
            let s3 = length(pLocal - vec3f(sin(t*10.0)*0.015, 0.08 * fH, cos(t*16.0)*0.015)) - 0.04 * saveProgress;
            let flame = smin(smin(s1, s2, 0.04), s3, 0.04);
            res_map = opU(res_map, MapRes(flame, 9, vec3f(0.0)));
        }
    }
    if (room_idx == 6) {
        let bucketPos = vec3f(0.3, 0.0, 0.7);
        var bucket = sdBox(p - bucketPos - vec3f(0.0, 0.05, 0.0), vec3f(0.04, 0.05, 0.04));
        res_map = opU(res_map, MapRes(bucket, 6, vec3f(0.4, 0.3, 0.2)));
    }
    if (room_idx == 8) {
        let depth = (p.x + p.z) / 2.0;
        let tideSwell = sin(t * 1.2) * 0.06;
        let shoreNoise = ( fbm( vec2f( (p.x - p.z) * 4.0, t * 0.4 ) ) - 0.5 ) * 0.12;
        let shore = WATER_START_DEPTH + shoreNoise + tideSwell;
        if (depth > shore - 0.05) {
            let water = p.y;
            res_map = opU(res_map, MapRes(water * 0.5, 7, vec3f(0.0)));
        }
    } else if (room_idx == 6) {
        let pWidth = (p.x - p.z) / 2.0;
        let dryWidth = max(0.05, 0.25 - u_anim.w * 0.01);
        let floodSwell = sin(t * 1.5) * 0.02;
        let floodNoise = (fbm(vec2f(p.x * 5.0, t * 0.5)) - 0.5) * 0.05;
        let shore = dryWidth + floodSwell + floodNoise;
        if (abs(pWidth) > shore - 0.05) {
            res_map = opU(res_map, MapRes(p.y * 0.5, 7, vec3f(0.0)));
        }
    }
    return res_map;
}

@fragment
fn fs( @builtin(position) fragPos: vec4f ) -> @location(0) vec4f {
    let ps = max( u_view.x, 1.0 );
    let block = floor( fragPos.xy / ps ) * ps + ps * 0.5;
    let t = u_view.w;
    let room_idx = i32(round(u_room_idx.x));

    let cx = res.x * 0.5; let cy = res.y * 0.3;
    let rx = res.x * 0.45; let ry = res.y * 0.35;

    let rd = normalize(vec3f(-1.0, -2.0, -1.0));
    let uv = getUV(block, cx, cy, rx, ry);
    var ro = vec3f(uv.x, 0.0, uv.y) - rd * 10.0;

    var t_dist = 0.0;
    var res_map: MapRes;
    var volLight = 0.0;
    for(var i = 0; i < 150; i++) {
        let p = ro + rd * t_dist;
        res_map = map(p, t, room_idx, cx, cy, rx, ry, block);
        if (res_map.d < 0.001) {
            var should_discard = false;
            let noise = hash21(floor(block / 3.0));
            if (res_map.mat == 4 && noise < u_player.z) { should_discard = true; }
            if (res_map.mat == 5 && noise < u_npc.z) { should_discard = true; }
            if (!should_discard) { break; }
            res_map.d = 0.01;
        }
        
        let npcPos = vec3f(u_npc.x, u_room.z * 0.5, u_npc.y);
        let distToNpc = length(p - npcPos);
        volLight += max(0.0, 0.45 - distToNpc) * 0.3 * res_map.d;

        t_dist += res_map.d;
        if (t_dist > 20.0) { break; }
    }
    
    var col = vec3f(1.0);
    var p = ro + rd * t_dist;
    var isHallway = p.x > 0.85 && p.x < 1.3 && p.z > 0.85 && p.z < 1.3 && room_idx < 8;

    if (t_dist <= 20.0) {
        let e = vec2f(0.001, 0.0);
        let n = normalize(vec3f(
            map(p + e.xyy, t, room_idx, cx, cy, rx, ry, block).d - map(p - e.xyy, t, room_idx, cx, cy, rx, ry, block).d,
            map(p + e.yxy, t, room_idx, cx, cy, rx, ry, block).d - map(p - e.yxy, t, room_idx, cx, cy, rx, ry, block).d,
            map(p + e.yyx, t, room_idx, cx, cy, rx, ry, block).d - map(p - e.yyx, t, room_idx, cx, cy, rx, ry, block).d
        ));
        
        if (res_map.mat == 0) {
            let stipple = fbm( p.xz * 25.0 ) * 0.04;
            col = FLOOR_COL - vec3f(stipple);
            let worldDepth = (p.x + p.z) / 2.0;
            col -= vec3f( ( 1.0 - worldDepth ) * 0.035 );
            if (isHallway) { col = HALLWAY_COL - vec3f(fbm(p.xz * 20.0) * 0.04); }
        } else if (res_map.mat == 1) { col = mix( LEFT_WALL_BOT, LEFT_WALL_TOP, clamp(p.y, 0.0, 1.0) );
        } else if (res_map.mat == 2) { col = mix( RIGHT_WALL_BOT, RIGHT_WALL_TOP, clamp(p.y, 0.0, 1.0) );
        } else if (res_map.mat == 3) { col = BASEBOARD_COL;
        } else if (res_map.mat == 4 || res_map.mat == 5 || res_map.mat == 6) { col = res_map.col;
        } else if (res_map.mat == 8) {
            let saveProgress = u_room_idx.y;
            col = mix(vec3f(0.1, 0.1, 0.12), vec3f(0.4, 0.7, 1.0), saveProgress);
        } else if (res_map.mat == 9) {
            let gradient = clamp((p.y - 0.01) / 0.15, 0.0, 1.0);
            col = mix(vec3f(1.0, 0.9, 0.1), vec3f(1.0, 0.2, 0.0), gradient);
        } else if (res_map.mat == 7) {
            let scr = getScreen(p, cx, cy, rx, ry);
            let sim = simH( i32(scr.x), i32(scr.y) ) * 9.0;
            
            // Bump mapping to avoid expensive geometric displacement
            let sR = simH( i32(scr.x + 1.0), i32(scr.y) ) * 9.0;
            let sU = simH( i32(scr.x), i32(scr.y + 1.0) ) * 9.0;
            let dX = sR - sim;
            let dZ = sU - sim;
            
            var wn = normalize(vec3f(-dX * 5.0, 1.0, -dZ * 5.0));
            wn = normalize(wn + vec3f((fbm(p.xz*10.0+t) - 0.5)*0.1, 0.0, (fbm(p.xz*12.0-t) - 0.5)*0.1));

            let L_w = normalize( vec3f( 0.45, 0.7, -0.25 ) );
            let V = -rd; let H = normalize( L_w + V );
            let diff_w = max( dot( wn, L_w ), 0.0 );
            let spec = pow( max( dot( wn, H ), 0.0 ), 80.0 );
            let fres = pow( 1.0 - max( dot(wn, V), 0.0 ), 3.0 );
            
            // Oceanic tidal sea colors
            var wcol = mix( vec3f( 0.02, 0.15, 0.25 ), vec3f( 0.1, 0.4, 0.6 ), diff_w );
            wcol += vec3f( 0.2, 0.4, 0.6 ) * fres * 0.4; 
            wcol += vec3f( 1.0, 0.98, 0.95 ) * spec * 0.6;
            
            var waterMask = 1.0;
            var foamMask = 0.0;
            if (room_idx == 8) {
                let depth = (p.x + p.z) / 2.0;
                let tideSwell = sin(t * 1.2) * 0.06; let shoreNoise = ( fbm( vec2f( (p.x - p.z) * 4.0, t * 0.4 ) ) - 0.5 ) * 0.12;
                let shore = WATER_START_DEPTH + shoreNoise + tideSwell;
                waterMask = smoothstep( shore, shore + 0.02, depth );
                foamMask  = smoothstep( shore - 0.01, shore + 0.015, depth ) - smoothstep( shore + 0.015, shore + 0.04, depth );
            } else if (room_idx == 6) {
                let pWidth = (p.x - p.z) / 2.0;
                let dryWidth = max(0.05, 0.25 - u_anim.w * 0.01);
                let floodSwell = sin(t * 1.5) * 0.02;
                let floodNoise = (fbm(vec2f(p.x * 5.0, t * 0.5)) - 0.5) * 0.05;
                let shore = dryWidth + floodSwell + floodNoise;
                waterMask = smoothstep( shore - 0.02, shore, abs(pWidth) );
                foamMask = smoothstep( shore - 0.04, shore - 0.015, abs(pWidth) ) - smoothstep( shore - 0.015, shore + 0.01, abs(pWidth) );
            }
            
            wcol = mix(wcol, vec3f(0.9, 0.95, 1.0), foamMask * 0.85); 
            
            let floor_col = FLOOR_COL - vec3f( ( 1.0 - ((p.x + p.z)/2.0) ) * 0.035 );
            col = mix( floor_col, wcol, waterMask * 0.85 );
        }
        
        if (res_map.mat != 7 && res_map.mat != 8 && res_map.mat != 9) {
            let L = normalize(vec3f(0.2, 1.0, 0.2));
            let diff = max(dot(n, L), 0.0);
            let amb = 0.5 + 0.5 * n.y;
            var shadow = 1.0; var st = 0.01;
            for(var i=0; i<20; i++) {
                let h = map(p + L * st, t, room_idx, cx, cy, rx, ry, block).d;
                if (h < 0.001) { shadow = 0.1; break; }
                shadow = min(shadow, 8.0 * h / st);
                st += h; if (st > 2.0) { break; }
            }
            shadow = clamp(shadow, 0.1, 1.0);
            col = col * (amb * 0.4 + diff * 0.6 * shadow);
        }
        
        // 2D noise fire removed from here
        if (room_idx == 6 && res_map.mat == 0) {
            let saveProgress = u_room_idx.y;
            let distToBucket = length(p.xz - vec2f(0.3, 0.7));
            let puddleRadius = saveProgress * 0.25;
            let edgeFade = smoothstep(puddleRadius, puddleRadius - 0.05, distToBucket);
            if (edgeFade > 0.0) {
                let puddle = fbm(vec2f(p.x * 25.0, p.z * 25.0 - t * 0.5));
                if (puddle > 0.4) { col = mix(col, vec3f(0.15, 0.35, 0.6), edgeFade * (puddle - 0.4) * 2.5); }
            }
        }
        if (room_idx == 7) {
            if (res_map.mat == 0) {
                let puddle = fbm(vec2f(p.x * 15.0, p.z * 15.0));
                if (puddle > 0.6) { col = mix(col, vec3f(0.3, 0.5, 0.8), (puddle - 0.6)*2.0); }
            } else if (res_map.mat == 1 || res_map.mat == 2) {
                let tear = fbm(vec2f(p.x * 0.05 + p.z * 0.05, p.y * 0.1 - t * 1.5));
                if (tear > 0.65) { col = mix(col, vec3f(0.4, 0.6, 0.9), (tear - 0.65)*2.0); }
            }
        }
    }
    
    // Screen-space smoke removed
    
    let textPS = 1.0; 
    let textBlock = floor( fragPos.xy / textPS ) * textPS + textPS * 0.5;
    
    // Subtitle Background SDF Box
    if (u_subtitle.z > 0.0) {
        let boxCenter = u_subtitle.xy;
        let boxHalfSize = u_subtitle.zw;
        
        let p2 = block - boxCenter;
        // Edge Noise slower
        let edgeNoise = (fbm(block * 0.05 - t * 0.3) - 0.5) * 20.0;
        
        let q = abs(p2) - boxHalfSize;
        let dBox = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) + edgeNoise;
        
        let boxAlpha = 1.0 - clamp(dBox / 20.0, 0.0, 1.0);
        
        if (boxAlpha > 0.0) {
            let dissolveAlpha = u_view.y;
            let dissolveNoise = fbm(block * 0.02 - t * 0.08);
            if (dissolveNoise < dissolveAlpha) {
                // Soft blend onto background
                col = mix(col, vec3f(0.04, 0.11, 0.23), boxAlpha * 0.9);
            }
        }
    }
    
    let textUV = textBlock / res;
    let ov = textureSampleLevel( overlayTex, samp, textUV, 0.0 );
    var finalAlpha = ov.a;
    
    // Fix Canvas 2D 8-bit rounding asymptote which leaves faint trails
    finalAlpha = max(0.0, (finalAlpha - 0.03) / 0.97);
    
    // Apply dissolve transition to the subtitle text
    if (textUV.y > 0.81 && finalAlpha > 0.0) {
        let dissolveAlpha = u_view.y;
        let noise = fbm(textUV * 200.0 - t * 0.08);
        if (noise > dissolveAlpha) {
            finalAlpha = 0.0;
        }
    }
    
    col = mix( col, ov.rgb, finalAlpha );

    // Dithered Volumetric God Rays
    let dither = (hash21(block * 13.37 + t) - 0.5) * 0.1;
    let finalVolLight = smoothstep(0.1, 0.7, volLight + dither);
    let glowCol = mix(vec3f(0.5, 0.7, 1.0), vec3f(1.0, 1.0, 1.0), f32(room_idx) / 8.0);
    col += glowCol * finalVolLight * clamp(1.0 - u_npc.z, 0.0, 1.0) * 0.6; // Fade out as NPC dissolves

    col = mix( col, vec3f( 0.0 ), u_player.w );

    return vec4f( col, 1.0 );
}
