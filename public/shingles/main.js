import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const POEM = [
    { lines: ["smoke stacks,", "chimneys,", "and shingles", "on the roof."] },
    { lines: ["I’m always looking,", "toward the top,", "at things I need to prove."] },
    { lines: ["dull and grey,", "but firmly set", "upon a foundation", "of sweat and grit."] },
    { lines: ["so that’s the plan", "my eyes look on:", "to work through prose,", "despite all cons."] },
    { lines: ["and my life will sit", "in idle state,", "as bricks are laid;", "all one in the same."] },
    { lines: ["so one day,", "i’ll have been built,", "and all my work", "will lay distilled"] },
    { lines: ["in smoke stacks,", "chimneys,", "and shingles", "on the roof."] },
];

const w = window.innerWidth;
const h = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.debug.checkShaderErrors = true;
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

const fragReq = await fetch('./frag.glsl');
const frag = await fragReq.text();

const vert = `
    void main() {
        gl_Position = vec4(position, 1.0);
    }
`;

const oc = document.createElement('canvas');
oc.width = w; oc.height = h;
const octx = oc.getContext('2d', { willReadFrequently: true });

const overlayTex = new THREE.CanvasTexture(oc);
overlayTex.minFilter = THREE.LinearFilter;
overlayTex.magFilter = THREE.LinearFilter;

function uploadOverlay() {
    overlayTex.needsUpdate = true;
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function now()          { return performance.now() / 1000; }

let game = {
    stanzaIdx: 0,
    lineIdx: 0,
    lineStart: now(),
    ended: false,
    endTime: 0,
    subtitleBox: null,
};

const LINE_HOLD = 2.5;
const LINE_FADE = 1.0;
const STANZA_PAUSE = 1.8; // Extra breath between stanzas
const FINAL_STANZA_MULT = 1.6; // Final stanza plays slower for cyclical emphasis

function drawSubtitle( text, alpha, cx, cy ) {
    if( !text ) {
        return;
    }
    const t = now();
    octx.save();
    octx.globalAlpha = 1.0; 
    octx.textAlign    = 'center';
    octx.textBaseline = 'middle';

    const fontSize = Math.max( 48, Math.round( Math.min(w, h) * 0.08 ) );
    octx.font = `lighter ${fontSize}px "Brush Script MT", "Lucida Handwriting", cursive`;

    // Drop shadow for legibility against bright sky
    octx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    octx.shadowBlur = 4;
    octx.shadowOffsetX = 2;
    octx.shadowOffsetY = 2;
    
    octx.fillStyle = `rgba(255, 255, 255, ${alpha})`; 
    octx.fillText( text, cx, cy );
    octx.restore();
}

function redrawOverlay(alpha, timeOfDay) {
    octx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.25; // Higher up in the sky

    const stanza = POEM[game.stanzaIdx];
    drawSubtitle( stanza.lines[ game.lineIdx ] || '', alpha, cx, cy );

    if (game.ended) {
        const ea = now() - game.endTime;
        if (ea > 4.0) {
            const creditsEl = document.getElementById('credits');
            if (creditsEl) creditsEl.classList.add('visible');
        }
    }

    uploadOverlay();
}

function tick() {
    const t = now();
    const stanza = POEM[game.stanzaIdx];
    const lineAge = t - game.lineStart;

    // Final stanza repeats the first — play it slower
    const isFinalStanza = game.stanzaIdx === POEM.length - 1;
    const holdTime = isFinalStanza ? LINE_HOLD * FINAL_STANZA_MULT : LINE_HOLD;
    const fadeTime = isFinalStanza ? LINE_FADE * FINAL_STANZA_MULT : LINE_FADE;

    let alpha = 0.0;
    if (lineAge < fadeTime) {
        alpha = lineAge / fadeTime;
    } else if (lineAge < fadeTime + holdTime) {
        alpha = 1.0;
    } else {
        alpha = Math.max( 0, 1 - (lineAge - fadeTime - holdTime) / fadeTime );
    }

    const lineDuration = holdTime + fadeTime * 2;
    if (lineAge > lineDuration) {
        if (game.lineIdx < stanza.lines.length - 1) {
            game.lineIdx++;
            game.lineStart = t;
        } else if (game.stanzaIdx < POEM.length - 1) {
            // Stanza pause — extra silence between stanzas
            if (lineAge > lineDuration + STANZA_PAUSE) {
                game.stanzaIdx++;
                game.lineIdx = 0;
                game.lineStart = t;
            }
        } else if (!game.ended) {
            game.ended = true;
            game.endTime = t;
        }
    }

    // Calculate time of day (0.0 = dawn, 1.0 = deep night)
    let totalLines = POEM.reduce((acc, s) => acc + s.lines.length, 0);
    let linesPassed = 0;
    for (let i = 0; i < game.stanzaIdx; i++) linesPassed += POEM[i].lines.length;
    linesPassed += game.lineIdx;
    
    // Add fractional progress of current line
    let currentLineAge = t - game.lineStart;
    const isFinal = game.stanzaIdx === POEM.length - 1;
    const curHold = isFinal ? LINE_HOLD * FINAL_STANZA_MULT : LINE_HOLD;
    const curFade = isFinal ? LINE_FADE * FINAL_STANZA_MULT : LINE_FADE;
    // Include stanza pause in the total duration so timeOfDay advances continuously
    const isLastLineOfStanza = game.lineIdx === stanza.lines.length - 1;
    const pauseTime = (isLastLineOfStanza && game.stanzaIdx < POEM.length - 1) ? STANZA_PAUSE : 0;
    let lineProgress = clamp(currentLineAge / (curHold + curFade * 2 + pauseTime), 0, 1);
    
    let timeOfDay = (linesPassed + lineProgress) / totalLines;
    if (game.ended) {
        timeOfDay = 1.0;
    }

    game.subtitleAlpha = alpha;
    game.timeOfDay = timeOfDay;

    redrawOverlay(alpha, timeOfDay);
}

const uniforms = {
    res: { value: new THREE.Vector2(w, h) },
    u_view: { value: new THREE.Vector4(3.0, 0.0, 0.0, 0.0) }, // [pixelSize, timeOfDay, subtitleAlpha, time]
    overlayTex: { value: overlayTex },
};

redrawOverlay(0, 0);
const startTime = now();

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: uniforms,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

window.addEventListener('resize', () => {
    const newW = window.innerWidth;
    const newH = window.innerHeight;
    renderer.setSize(newW, newH);
    uniforms.res.value.set(newW, newH);
    oc.width = newW;
    oc.height = newH;
    redrawOverlay(game.subtitleAlpha, game.timeOfDay);
});

function animate() {
    requestAnimationFrame(animate);
    
    tick();
    const t = now() - startTime;
    
    uniforms.u_view.value.set(3.0, game.timeOfDay, game.subtitleAlpha, t);
    
    renderer.render(scene, camera);
}
animate();
