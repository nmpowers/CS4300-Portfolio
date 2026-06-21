import { default as seagulls } from '../gulls/gulls.js';

const POEM = [
    { lines: ["Deep Blue",                  "this is the end",            "of me",                    "and you"] },
    { lines: ["every time",                 "you call to me,",            "a sinking song",           "of love and peace."] },
    { lines: ["And I fall",                 "so deeply down",             "sinking swiftly",          "into soothing sound."] },
    { lines: ["far too much",               "for my shallow heart;",      "the land and I",           "drifting apart."] },
    { lines: ["oh deep blue—",         "I’m no good,",          "you don’t deserve",   "to wash my soot"] },
    { lines: ["all the time,",              "I feel drawn back,",         "but I remember",           "the care I lack."] },
    { lines: ["So break your waves,",       "and drown me out,",          "because with my love",     "comes hints of doubt,"] },
    { lines: ["and everywhere",             "that I go",                  "I see aqua skies,",        "and the tears in your eyes"] },
    { lines: ["so I’m forever,",       "in your debt;",              "oh deep blue",             "this is the end."] },
];

const sg      = await seagulls.init(),
    frag    = await seagulls.import( './frag.wgsl' ),
    compute = await seagulls.import( './compute.wgsl' ),
    render  = seagulls.constants.vertex + frag,
    w       = sg.width,
    h       = sg.height;

const waterState = new Float32Array( w * h * 2 );
const waterA = sg.buffer( waterState );
const waterB = sg.buffer( waterState );
const waterPP = sg.pingpong( waterA, waterB );

const oc = document.createElement('canvas');
oc.width = w; oc.height = h;
const octx = oc.getContext('2d');

const stainCanvas = document.createElement('canvas');
stainCanvas.width = w; stainCanvas.height = h;
const stainCtx = stainCanvas.getContext('2d');

const overlayTex = sg.device.createTexture({
    size:  [ w, h ],
    format:'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
overlayTex.type = 'texture';
const samp = sg.sampler({ addressModeU:'clamp-to-edge', addressModeV:'clamp-to-edge' });

function uploadOverlay() {
    const img = octx.getImageData( 0, 0, w, h );
    sg.device.queue.writeTexture( { texture: overlayTex }, img.data, { bytesPerRow: w * 4, rowsPerImage: h }, { width: w, height: h } );
}

const PIXEL          = 4.0;
const PLAYER_HEIGHT  = Math.max( 52, Math.round( Math.min(w, h) * 0.085 ) );
const NPC_HEIGHT     = Math.round( PLAYER_HEIGHT * 1.28 );
const SPEED          = 0.375;
const LINE_HOLD      = 2.6;
const LINE_FADE      = 1.5;
const NPC_BLEED      = 0.35;

const COL_PLAYER_START = [ 0.62, 0.78, 1.00 ];
const COL_PLAYER_END   = [ 0.016, 0.063, 0.122 ];
const COL_NPC_START    = [ 0.016, 0.063, 0.122 ];
const COL_NPC_END      = [ 1.00, 1.00, 1.00 ];

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function lerp(a, b, t)  { return a + (b - a) * t; }
function lerp3(a, b, t) { return [ lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t) ]; }
function distUV(a, b)   { return Math.hypot(a.u - b.u, a.v - b.v); }
function now()          { return performance.now() / 1000; }

function worldToScreen(u, v) {
    const cx = w * 0.5, cy = h * 0.3, rx = w * 0.45, ry = h * 0.35;
    return { x: cx + (u - v) * rx, y: cy + (u + v) * ry };
}

// Simple Audio Synthesizer for Piano
let audioCtx;
function playNote() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    // Randomize a few soothing pentatonic notes (E4, G4, A4, C5)
    const notes = [329.63, 392.00, 440.00, 523.25];
    osc.frequency.value = notes[Math.floor(Math.random() * notes.length)];
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
}

let droneOsc, droneGain;
function initDrone() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!droneOsc) {
        droneOsc = audioCtx.createOscillator();
        droneGain = audioCtx.createGain();
        droneOsc.type = 'sawtooth';
        droneOsc.connect(droneGain);
        droneGain.connect(audioCtx.destination);
        droneGain.gain.value = 0;
        droneOsc.start();
    }
}
function updateDrone(room) {
    if (!droneOsc) return;
    if (room < 8) {
        let progress = room / 8.0; // 0 to 1
        droneOsc.frequency.setTargetAtTime(45 + progress * 60, audioCtx.currentTime, 0.5);
        droneGain.gain.setTargetAtTime(0.002 + progress * 0.015, audioCtx.currentTime, 0.5);
    } else if (room >= 8) {
        droneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }
}

const game = {
    room: 0, lineIdx: 0, lineStart: 0,
    player: { u: 0.1, v: 0.1 }, npc: { u: 0.8, v: 0.8 },
    dissolve: 0, ended: false, endTime: 0, blackFade: 0, started: false, creditAlpha: 0,
    interactHint: "",
    walkPhase: 0, facing: 0, jumpHeight: 0, jumpVelocity: 0, isJumping: false,
    scriptedJump: false, jumpTimer: 0, jumpStartU: 0, jumpStartV: 0, jumpTargetU: 0, jumpTargetV: 0,
    saved: false, saveProgress: 0, pianoClicks: 0
};

const keys = Object.create( null );
const hintEl = document.getElementById('hint');

const MOVEMENT_KEYS = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[ k ] = true;
    if( !game.started && MOVEMENT_KEYS.has( k ) ) {
        game.started = true;
        game.lineStart = now();
        if( hintEl ) hintEl.style.opacity = '0';
    }
    // Interaction Events
    if(k === 'e' && !e.repeat && game.interactHint !== "") {
        if (game.room === 0 || game.room === 2 || game.room === 4 || game.room === 6 || game.room === 7) {
            game.saved = true;
            game.interactHint = "";
        } else if (game.room === 1) {
            playNote();
            game.pianoClicks++;
            if (game.pianoClicks >= 3) {
                game.saved = true;
                game.interactHint = "";
            }
        }
    }
    // Jump Action
    if (k === ' ' && !game.isJumping && !game.scriptedJump) {
        let pDepth = (game.player.u + game.player.v) / 2.0;
        let lineAge = now() - game.lineStart;
        let chasmWidth = 0.06 + Math.min(lineAge * 0.015, 0.12);
        
        if (game.room === 3 && Math.abs(pDepth - 0.5) < chasmWidth + 0.12 && pDepth < 0.5) {
            // Scripted jump across chasm
            game.scriptedJump = true;
            game.jumpTimer = 0;
            game.jumpStartU = game.player.u;
            game.jumpStartV = game.player.v;
            game.jumpTargetU = game.player.u + (chasmWidth * 2.0 + 0.15);
            game.jumpTargetV = game.player.v + (chasmWidth * 2.0 + 0.15);
        } else {
            game.isJumping = true;
            game.jumpVelocity = 1.3;
        }
    }
});
window.addEventListener('keyup', e => { keys[ e.key.toLowerCase() ] = false; });

function drawSubtitle( text, alpha, hint, cx, cy ) {
    if( !text && !hint ) {
        game.subtitleBox = null;
        return;
    }
    const t = now();
    octx.save();
    octx.globalAlpha = 1.0; 
    octx.textAlign    = 'center';
    octx.textBaseline = 'middle';

    const fontSize = Math.max( 20, Math.round( Math.min(w, h) * 0.034 ) );
    octx.font = `${fontSize}px Georgia, "Times New Roman", serif`;

    if (text) {
        const metrics = octx.measureText(text);
        const padding = fontSize * 0.5;
        const boxWidth = metrics.width + padding * 4;
        const boxHeight = fontSize + padding * 2;
        
        game.subtitleBox = [cx, cy, boxWidth / 2, boxHeight / 2];
        
        octx.fillStyle = 'rgb(255, 255, 255)'; 
        octx.fillText( text, cx, cy );
    } else {
        game.subtitleBox = null;
    }

    // Interaction Hint
    if (hint !== "") {
        const hintText = `Press [E] to ${hint}`;
        octx.font = `italic ${fontSize * 0.7}px Georgia, serif`;
        
        const hcy = text ? cy - fontSize * 2 : cy;
        const metrics = octx.measureText(hintText);
        const padding = fontSize * 0.4;
        const boxWidth = metrics.width + padding * 4;
        const boxHeight = (fontSize * 0.7) + padding * 2;
        
        octx.fillStyle = 'rgb(26, 58, 106)'; // Different blue for hint box
        octx.fillRect(cx - boxWidth / 2, hcy - boxHeight / 2, boxWidth, boxHeight);
        
        octx.fillStyle = 'rgb(254, 255, 255)'; // Slightly off-white for hint text
        octx.fillText(hintText, cx, hcy);
    }

    octx.restore();
}

function drawCredits( alpha ) {
    if( alpha <= 0 ) return;
    octx.save();
    octx.globalAlpha = alpha;
    octx.textAlign = 'center'; octx.textBaseline = 'middle';
    const fontSize = Math.round( Math.min(w, h) * 0.055 );
    octx.font = `italic ${fontSize}px Georgia, "Times New Roman", serif`;
    octx.fillStyle = '#ffffff';
    octx.fillText( 'By Nathaniel Powers', w * 0.5, h * 0.75 );
    octx.restore();
}

function redrawOverlay() {
    octx.clearRect( 0, 0, w, h );
    octx.drawImage(stainCanvas, 0, 0);
    if( !game.started ) {
        octx.save();
        octx.textAlign = 'center'; octx.textBaseline = 'middle';
        const big = Math.round( Math.min(w, h) * 0.10 );
        octx.fillStyle = '#0a1d3a'; octx.font = `italic ${big}px Georgia, "Times New Roman", serif`;
        octx.fillText( 'Deep Blue', w * 0.5, h * 0.42 );
        const small = Math.round( Math.min(w, h) * 0.024 );
        octx.fillStyle = '#3a4860'; octx.font = `${small}px Georgia, "Times New Roman", serif`;
        octx.fillText( 'a poem in nine rooms', w * 0.5, h * 0.42 + big * 0.7 );
        octx.restore();
        uploadOverlay();
        return;
    }

    const stanza = POEM[ game.room ];
    const lineAge = now() - game.lineStart;
    let alpha;
    if( lineAge < LINE_FADE )                  alpha = lineAge / LINE_FADE;
    else if( lineAge < LINE_FADE + LINE_HOLD ) alpha = 1.0;
    else                                       alpha = Math.max( 0, 1 - (lineAge - LINE_FADE - LINE_HOLD) / LINE_FADE );

    const cx = w / 2;
    const cy = h * 0.85;

    game.subtitleAlpha = alpha;
    drawSubtitle( stanza.lines[ game.lineIdx ] || '', alpha, game.interactHint, cx, cy );
    drawCredits( game.creditAlpha );
    uploadOverlay();
}

let dropData = [ -100, -100, 0.0, 0.0 ];
function spawnDroplet( x, y, strength, radius ) {
    dropData[0] = x; dropData[1] = y; dropData[2] = strength; dropData[3] = radius;
}

function nextRoom() {
    game.room++;
    game.lineIdx = 0;
    game.lineStart = now();
    game.player.u = 0.1; game.player.v = 0.1;
    game.npc.u    = 0.8; game.npc.v    = 0.8;
    game.saved    = false;
    game.saveProgress = 0;
    game.pianoClicks  = 0;

    if (game.room === 5) {
        game.npc.u = 0.5; game.npc.v = 0.5;
    }

    if( game.room === POEM.length - 1 ) {
        game.npc.u = 0.5; game.npc.v = 0.5;
        game.player.u = 0.1; game.player.v = 0.1;
    }
}

let prevT = now();
function step() {
    const t = now();
    const dt = Math.min( 0.05, t - prevT );
    prevT = t;
    if( !game.started ) return;

    const stanza = POEM[ game.room ];
    const isFinal = game.room === POEM.length - 1;

    if (game.started) {
        if (!droneOsc) initDrone();
        updateDrone(game.room);
    }

    let du = 0, dv = 0;
    if (game.scriptedJump) {
        game.jumpTimer += dt;
        let progress = Math.min(game.jumpTimer / 0.8, 1.0); // 0.8s jump
        game.jumpHeight = Math.sin(progress * Math.PI) * 0.25;
        game.player.u = lerp(game.jumpStartU, game.jumpTargetU, progress);
        game.player.v = lerp(game.jumpStartV, game.jumpTargetV, progress);
        game.facing = Math.atan2(game.jumpTargetV - game.jumpStartV, game.jumpTargetU - game.jumpStartU);
        game.walkPhase += dt * 15.0;
        if (progress >= 1.0) {
            game.scriptedJump = false;
            game.jumpHeight = 0;
        }
    } else {
        if( keys['w'] || keys['arrowup']    ) { du -= 1; dv -= 1; }
        if( keys['s'] || keys['arrowdown']  ) { du += 1; dv += 1; }
        if( keys['a'] || keys['arrowleft']  ) { du -= 1; dv += 1; }
        if( keys['d'] || keys['arrowright'] ) { du += 1; dv -= 1; }

        let mag = Math.hypot( du, dv );
        
        // Fade out old footprints gradually (runs every frame)
        if (game.room >= 4 && !isFinal) {
            stainCtx.globalCompositeOperation = 'destination-out';
            stainCtx.fillStyle = 'rgba(0, 0, 0, 0.02)';
            stainCtx.fillRect(0, 0, w, h);
            stainCtx.globalCompositeOperation = 'source-over';
        }
        
        // Staining Footprints (Room 4 onwards)
        if (game.room >= 4 && mag > 0 && !isFinal) {

            if (Math.random() < 0.2) {
                const pScreen = worldToScreen(game.player.u, game.player.v);
                stainCtx.fillStyle = `rgba(${Math.round(COL_PLAYER_END[0]*255)}, ${Math.round(COL_PLAYER_END[1]*255)}, ${Math.round(COL_PLAYER_END[2]*255)}, 0.4)`;
                stainCtx.fillRect(pScreen.x + (Math.random()-0.5)*12, pScreen.y + (Math.random()-0.5)*6 + h*0.05, 5, 5);
            }
        }

        if( mag > 0 ) { 
            du /= mag; dv /= mag; 
            game.walkPhase += dt * 15.0;
            game.facing = Math.atan2(dv, du);
        }
        
        if (game.isJumping) {
            game.jumpHeight += game.jumpVelocity * dt;
            game.jumpVelocity -= 4.5 * dt; // gravity
            if (game.jumpHeight <= 0) {
                game.jumpHeight = 0;
                game.isJumping = false;
                game.jumpVelocity = 0;
            }
        }
    }

    const lineAge = t - game.lineStart;
    const allLinesDone = game.lineIdx >= stanza.lines.length - 1 && lineAge > LINE_HOLD;

    // Animate Save Progress
    if (game.saved && game.saveProgress < 1.0) {
        game.saveProgress += dt * 0.5;
        if (game.saveProgress > 1.0) game.saveProgress = 1.0;
    }

    game.interactHint = "";
    if (allLinesDone && !game.saved && !isFinal) {
        let p = game.player;
        if (game.room === 0) {
            if (distUV(p, game.npc) < 0.2) game.interactHint = "save them";
        } else if (game.room === 1) {
            if (distUV(p, {u: 0.15, v: 0.15}) < 0.2) game.interactHint = "play piano";
        } else if (game.room === 2) {
            if (distUV(p, game.npc) < 0.2) game.interactHint = "let them fall";
        } else if (game.room === 4) {
            if (distUV(p, {u: 0.5, v: 0.5}) < 0.2) game.interactHint = "light fire";
        } else if (game.room === 6) {
            if (distUV(p, {u: 0.3, v: 0.7}) < 0.15) game.interactHint = "spill water";
        } else if (game.room === 7) {
            if (p.u < 0.2 && p.v > 0.4 && p.v < 0.6) game.interactHint = "open window";
        }
    }

    // Room 3 Physics (Holes)
    if (game.room === 2) {
        const holes = [{u:0.4, v:0.3}, {u:0.6, v:0.7}, {u:0.3, v:0.6}, {u:0.7, v:0.3}];
        for(let h of holes) {
            if(distUV(game.player, h) < 0.08) {
                game.player.u = 0.1; game.player.v = 0.1; // Fall out of bounds and respawn
            }
        }
    }

    if( game.dissolve < 1 ) {
        // Room 5 Physics (Magnetic Pull & Save condition)
        let frameSpeed = SPEED;
        if (game.room === 5) {
            let distFromNpc = distUV(game.player, game.npc);
            if (distFromNpc > 0.55 && !game.saved) {
                game.saved = true;
            }
            
            if (!game.saved) {
                let dirU = game.npc.u - game.player.u;
                let dirV = game.npc.v - game.player.v;
                let magPull = Math.hypot(dirU, dirV);
                if (magPull > 0) {
                    du += (dirU / magPull) * 0.45;
                    dv += (dirV / magPull) * 0.45;
                }
                frameSpeed = Math.max(0.04, SPEED * (1.0 - distFromNpc * 0.5));
                if (Math.hypot(du, dv) > 0) {
                    game.facing = Math.atan2(dv, du);
                }
            }
        }

        // Room 6 Flood Penalty
        if (game.room === 6) {
            let pWidth = (game.player.u - game.player.v) / 2.0;
            let dryWidth = Math.max(0.05, 0.25 - lineAge * 0.01);
            if (Math.abs(pWidth) > dryWidth) {
                frameSpeed *= 0.3;
            }
        }

        let proposedU = game.player.u + du * frameSpeed * dt;
        let proposedV = game.player.v + dv * frameSpeed * dt;

        // Room 4 Physics (Chasm/Bridge Boundary)
        if (game.room === 3 && !game.scriptedJump) {
            let pDepth = (proposedU + proposedV) / 2.0;
            let chasmWidth = 0.06 + Math.min(lineAge * 0.015, 0.12);
            if (Math.abs(pDepth - 0.5) < chasmWidth) {
                if (game.jumpHeight < 0.05) {
                    proposedU = 0.1;
                    proposedV = 0.1;
                }
            }
            if (pDepth > 0.5 + chasmWidth && !game.saved && allLinesDone) {
                game.saved = true;
            }
        }

        game.player.u = proposedU;
        game.player.v = proposedV;

        if (!isFinal) {
            // Hallway Constraint logic (Forces you out the front corner correctly)
            if (allLinesDone && game.saved && (game.player.u > 0.85 || game.player.v > 0.85)) {
                let avg = (game.player.u + game.player.v) / 2.0;
                game.player.u = avg;
                game.player.v = avg;
            } else {
                game.player.u = clamp( game.player.u, 0.02, 0.85 );
                game.player.v = clamp( game.player.v, 0.02, 0.85 );
            }
        } else {
            game.player.u = clamp( game.player.u, 0.02, 2.0 );
            game.player.v = clamp( game.player.v, 0.02, 2.0 );
        }
    }

    if( lineAge > LINE_HOLD + LINE_FADE * 2 && game.lineIdx < stanza.lines.length - 1 ) {
        game.lineIdx++;
        game.lineStart = t;
    }

    const pDepth = (game.player.u + game.player.v) / 2.0;

    if( !isFinal ) {
        if( pDepth > 1.05 ) nextRoom();
    } else {
        const waterDepth = 0.55;
        if( allLinesDone && pDepth > waterDepth ) {
            // Room 9 (Immediate Dissolve on waves)
            game.dissolve = 1.0;
            const pScreen = worldToScreen(game.player.u, game.player.v);

            if( !game.ended ) {
                game.ended = true;
                game.endTime = t;
                spawnDroplet( pScreen.x, pScreen.y + 20, 2.0, 60 ); // Massive splash
            }
        }

        if( game.ended ) {
            const ea = t - game.endTime;
            game.creditAlpha = clamp( (ea - 1.5) / 2.0, 0, 1 );
            if( ea > 9 ) game.blackFade = clamp( (ea - 9) / 5.0, 0, 1 );
        }
        game.tide = (Math.sin(t * 0.5) * 0.5 + 0.5);
    }
}

const res = sg.uniform([ w, h ]);
const waterParams = sg.uniform([ 0.46, 0.994, 0.9992, 0.0 ]);
const u_drop      = sg.uniform( dropData );
const u_view      = sg.uniform([ PIXEL, 0.0, h * 0.55, 0.0 ]);
const u_player    = sg.uniform([ game.player.u, game.player.v, 0.0, 0.0 ]);
const u_npc       = sg.uniform([ game.npc.u,    game.npc.v,    0.0, 0.0 ]);
const u_pcol      = sg.uniform([ ...COL_PLAYER_START, 0.0 ]);
const u_ncol      = sg.uniform([ ...COL_NPC_START,    0.0 ]);
const u_room      = sg.uniform([ PLAYER_HEIGHT, 1.0, NPC_HEIGHT, 0.0 ]);
const u_room_idx  = sg.uniform([ 0.0, 0.0, 0.0, 0.0 ]);
const u_anim      = sg.uniform([ 0.0, 0.0, 0.0, 0.0 ]);
const u_subtitle  = sg.uniform([ 0.0, 0.0, 0.0, 0.0 ]);

redrawOverlay();
const startTime = now();

const renderPass = await sg.render({
    shader: render,
    // Add u_room_idx to the bind group matching WGSL updates
    data: [ res, waterPP, u_view, u_player, u_npc, u_pcol, u_ncol, u_room, u_room_idx, samp, overlayTex, u_anim, u_subtitle ],
    onframe: () => {
        step();
        redrawOverlay();

        const t = now() - startTime;
        const isFinal = game.room === POEM.length - 1;
        u_view.value = [ PIXEL, game.subtitleAlpha || 0.0, h * 0.55, t ];

        const k = POEM.length > 1 ? game.room / (POEM.length - 1) : 1;
        
        if (game.subtitleBox) {
            u_subtitle.value = game.subtitleBox;
        } else {
            u_subtitle.value = [0.0, 0.0, 0.0, 0.0];
        }
        u_pcol.value = [ ...lerp3( COL_PLAYER_START, COL_PLAYER_END, k ), 0.0 ];
        u_ncol.value = [ ...lerp3( COL_NPC_START,    COL_NPC_END,    k ), 0.0 ];

        const npcDissolve = isFinal ? 0.0 : game.saveProgress;
        u_npc.value  = [ game.npc.u,    game.npc.v,    npcDissolve, 0.0 ];
        u_player.value = [ game.player.u, game.player.v, game.dissolve, game.blackFade ];
        u_room.value = [ PLAYER_HEIGHT, isFinal ? 0.45 : 1.0 * (1 - npcDissolve), NPC_HEIGHT, 0.0 ];
        u_room_idx.value = [ game.room, game.saveProgress, 0.0, 0.0 ];
        
        let la = Math.max(0, now() - game.lineStart);
        u_anim.value = [ game.walkPhase, game.facing, game.jumpHeight, la ];
    }
});

const computePass = sg.compute({
    shader: compute,
    data: [ res, waterPP, waterParams, u_drop ],
    dispatchCount: [ Math.ceil(w/8), Math.ceil(h/8), 1 ],
    onframe: () => { u_drop.value = dropData; },
    onframeend: () => { dropData[2] = 0.0; }
});

sg.run( computePass, renderPass );