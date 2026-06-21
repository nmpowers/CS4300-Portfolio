import { default as seagulls } from '../gulls/gulls.js';

const POEM = [
    { lines: ["smoke stacks,", "chimneys,", "and shingles", "on the roof."] },
    { lines: ["I’m always looking,", "toward the top,", "at things I need to prove."] },
    { lines: ["dull and grey,", "but firmly set", "upon a foundation", "of sweat and grit."] },
    { lines: ["so that’s the plan", "my eyes look on:", "to work through prose,", "despite all cons."] },
    { lines: ["and my life will sit", "in idle state,", "as bricks are laid;", "all one in the same."] },
    { lines: ["so one day,", "i’ll have been built,", "and all my work", "will lay distilled"] },
    { lines: ["in smoke stacks,", "chimneys,", "and shingles", "on the roof."] },
];

const sg      = await seagulls.init(),
      frag    = await seagulls.import( './frag.wgsl' ),
      render  = seagulls.constants.vertex + frag,
      w       = sg.width,
      h       = sg.height;

const oc = document.createElement('canvas');
oc.width = w; oc.height = h;
const octx = oc.getContext('2d');

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

const LINE_HOLD = 3.5;
const LINE_FADE = 1.5;

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
        const creditAlpha = clamp((ea - 4.0) / 3.0, 0, 1);
        if (creditAlpha > 0) {
            octx.fillStyle = `rgba(255, 255, 255, ${creditAlpha})`;
            octx.font = `20px "Brush Script MT", "Lucida Handwriting", cursive`;
            octx.textAlign = 'center';
            octx.fillText("By Nathaniel Powers", w / 2, h / 2);
        }
    }

    uploadOverlay();
}

function tick() {
    const t = now();
    const stanza = POEM[game.stanzaIdx];
    const lineAge = t - game.lineStart;

    let alpha = 0.0;
    if (lineAge < LINE_FADE) {
        alpha = lineAge / LINE_FADE;
    } else if (lineAge < LINE_FADE + LINE_HOLD) {
        alpha = 1.0;
    } else {
        alpha = Math.max( 0, 1 - (lineAge - LINE_FADE - LINE_HOLD) / LINE_FADE );
    }

    if (lineAge > LINE_HOLD + LINE_FADE * 2) {
        if (game.lineIdx < stanza.lines.length - 1) {
            game.lineIdx++;
            game.lineStart = t;
        } else if (game.stanzaIdx < POEM.length - 1) {
            game.stanzaIdx++;
            game.lineIdx = 0;
            game.lineStart = t;
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
    let lineProgress = clamp(lineAge / (LINE_HOLD + LINE_FADE * 2), 0, 1);
    
    let timeOfDay = (linesPassed + lineProgress) / totalLines;
    if (game.ended) {
        timeOfDay = 1.0;
    }

    game.subtitleAlpha = alpha;
    game.timeOfDay = timeOfDay;

    redrawOverlay(alpha, timeOfDay);
}

const res = sg.uniform([ w, h ]);
const u_view = sg.uniform([ 3.0, 0.0, 0.0, 0.0 ]); // pixel size, timeOfDay, reserved, time
const u_subtitle = sg.uniform([ 0.0, 0.0, 0.0, 0.0 ]);

redrawOverlay(0, 0);
const startTime = now();

const renderPass = await sg.render({
    shader: render,
    data: [ res, u_view, samp, overlayTex, u_subtitle ],
    onframe: () => {
        tick();
        const t = now() - startTime;
        
        // Pass timeOfDay and subtitleAlpha
        u_view.value = [ 3.0, game.timeOfDay, game.subtitleAlpha, t ];

        if (game.subtitleBox) {
            u_subtitle.value = game.subtitleBox;
        } else {
            u_subtitle.value = [0.0, 0.0, 0.0, 0.0];
        }
    }
});

sg.run(renderPass);
