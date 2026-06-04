import { default as seagulls } from '../gulls/gulls.js';
import { Pane } from 'https://esm.sh/tweakpane';

// ============================================================================
//  POEM  -  one entry per verse. Each click drops a droplet and reveals
//  the next verse; after the last verse it loops back to the first.
// ============================================================================
const poem = [
    `\"back down the well\"`,
    `A Poem by Nathaniel Powers`,
    `I keep returning`,
    `to the ground,`,
    `like water falling`,
    `back down the well.`,
    ``,
    `Sorry\'s, sticks, stones, stalactites`,
    `building up-- to leave a mark`,
    `of the somethings to find in nothings`,
    `we call \"Home\"`,
    ``,
    `Fuzzy moss and mud and bugs;`,
    `intricacies we pass with shrugs.`,
    `Pasts and cuts, lime and dust,`,
    `thicker air never filled lungs.`,
    ``,
    `Lips with red, blush and burn,`,
    `teeth keep talking out of turn-`,
    `here and there, but neither fair-`,
    `skies will part; leaves will tear.`,
    ``,
    `Hearts and breaks-`,
    `like birthdays and cakes,`,
    `celebrating the somethings`,
    `to fill nothing\'s space.`,
    ``,
    `And I know water would rather be falling`,
    `than stand dormant in nothing\'s thirst,`,
    `yet time passes the plants and I by,`,
    `because we\'re too scared to grow anywhere\nbut the dirt.`
];

const sg      = await seagulls.init(),
      frag    = await seagulls.import( './frag.wgsl' ),
      compute = await seagulls.import( './compute.wgsl' ),
      render  = seagulls.constants.vertex + frag,
      w       = sg.width,
      h       = sg.height,
      size    = w * h;

// ---- simulation state: vec2f( height, velocity ) per cell, starts calm -------
const state        = new Float32Array( size * 2 );
const statebuffer1 = sg.buffer( state );
const statebuffer2 = sg.buffer( state );
const pingpong     = sg.pingpong( statebuffer1, statebuffer2 );

const res = sg.uniform([ w, h ]);

// ---- offscreen 2D canvas used to rasterise the current verse into a texture --
const textCanvas  = document.createElement('canvas');
textCanvas.width  = w;
textCanvas.height = h;
const tctx = textCanvas.getContext('2d');

const textTexture = sg.device.createTexture({
    size:  [ w, h ],
    format:'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
textTexture.type = 'texture';
const textSampler = sg.sampler({ addressModeU:'clamp-to-edge', addressModeV:'clamp-to-edge' });

function uploadText() {
    const img = tctx.getImageData( 0, 0, w, h );
    sg.device.queue.writeTexture(
        { texture: textTexture },
        img.data,
        { bytesPerRow: w * 4, rowsPerImage: h },
        { width: w, height: h }
    );
}
uploadText(); // start blank

// word-wrap + draw a verse centred near the click point, then push to the GPU
function drawVerse( verse, cx, cy ) {
    tctx.clearRect( 0, 0, w, h );
    tctx.fillStyle    = 'white';
    tctx.textAlign    = 'center';
    tctx.textBaseline = 'middle';

    const fontSize = Math.round( Math.min( w, h ) * 0.045 );
    const lineH    = fontSize * 1.4;
    const maxWidth = w * 0.7;
    tctx.font = `${fontSize}px Georgia, "Times New Roman", serif`;

    // build wrapped lines, honouring explicit line breaks
    const lines = [];
    for( const raw of verse.split('\n') ) {
        const words = raw.split(' ');
        let line = '';
        for( const word of words ) {
            const test = line ? line + ' ' + word : word;
            if( tctx.measureText( test ).width > maxWidth && line ) {
                lines.push( line );
                line = word;
            } else {
                line = test;
            }
        }
        lines.push( line );
    }

    // clamp the block so it stays comfortably on screen
    const blockH = lines.length * lineH;
    let y = Math.min( Math.max( cy, blockH * 0.5 + 20 ), h - blockH * 0.5 - 20 );
    const x = Math.min( Math.max( cx, maxWidth * 0.5 + 20 ), w - maxWidth * 0.5 - 20 );
    y -= blockH * 0.5 - lineH * 0.5;

    for( const line of lines ) {
        tctx.fillText( line, x, y );
        y += lineH;
    }
    uploadText();
}

// ---- droplet input (debounced so verses can't be spammed) -------------------
const COOLDOWN = 6.0; // seconds: a new drop+verse is ignored until this elapses
const HOLD     = 3.5; // seconds the verse stays fully readable
const FADE     = 2.5; // seconds it then takes to dissolve away

let dropData   = [ -100, -100, 0.0, 0.0 ]; // x, y, strength, radius
const u_drop   = sg.uniform( dropData );

// constant rain: up to RAIN_MAX dimples per simulation step, refreshed each frame
const RAIN_MAX = 16;
const rainData = new Array( RAIN_MAX * 4 ).fill( 0 );
const u_rain   = sg.uniform( rainData );

let verseIndex = 0;
let lastDrop   = -999;
let dropTime   = -999;
const startTime = performance.now() / 1000;

const hint = document.getElementById('hint');

sg.canvas.addEventListener('mousedown', e => {
    const now = performance.now() / 1000;
    if( now - lastDrop < COOLDOWN ) return; // debounce: one drop at a time
    lastDrop = now;
    dropTime = now;

    dropData[0] = e.clientX;
    dropData[1] = e.clientY;
    dropData[2] = params.dropStrength; // consumed for a single sim step
    dropData[3] = params.dropRadius;

    drawVerse( poem[ verseIndex ], e.clientX, e.clientY );
    verseIndex = ( verseIndex + 1 ) % poem.length;

    if( hint ) hint.style.opacity = '0';
});

// ---- tweakable parameters ----------------------------------------------------
const params = {
    pixelSize:     6.0,
    waveSpeed:     0.47,
    damping:       0.994,
    slack:         0.9992,
    dropStrength:  0.8,
    dropRadius:    18.0,
    noise:         0.11,
    heightScale:   9.0,
    lightAngle:    0.7,
    rainRate:      1.4,   // expected new raindrops per frame
    rainStrength:  0.07,  // how hard each raindrop hits
    rainRadius:    7.0,   // size of a raindrop dimple
    wellRadius:    0.38,  // size of the reflected pool of daylight
    wellLight:     0.32,  // brightness of that reflection
    wellDepth:     0.78,  // how dark the surrounding "well walls" get
    shimmer:       0.10,  // how much ripples wobble the reflection
};

const pane = new Pane();
const fWater = pane.addFolder({ title: 'Water' });
fWater.addBinding( params, 'pixelSize',    { min: 1.0,  max: 24.0, step: 1.0, label: 'Pixel Size' } );
fWater.addBinding( params, 'waveSpeed',    { min: 0.1,  max: 0.5,  label: 'Wave Speed' } );
fWater.addBinding( params, 'damping',      { min: 0.97, max: 1.0,  label: 'Damping' } );
fWater.addBinding( params, 'noise',        { min: 0.0,  max: 0.4,  label: 'Base Waves' } );
fWater.addBinding( params, 'heightScale',  { min: 1.0,  max: 30.0, label: 'Ripple Height' } );

const fRain = pane.addFolder({ title: 'Rain' });
fRain.addBinding( params, 'rainRate',      { min: 0.0,  max: 6.0,  label: 'Rain Rate' } );
fRain.addBinding( params, 'rainStrength',  { min: 0.0,  max: 0.5,  label: 'Rain Strength' } );
fRain.addBinding( params, 'rainRadius',    { min: 2.0,  max: 20.0, label: 'Rain Drop Size' } );
fRain.addBinding( params, 'dropStrength',  { min: 0.1,  max: 2.0,  label: 'Click Strength' } );
fRain.addBinding( params, 'dropRadius',    { min: 4.0,  max: 60.0, label: 'Click Size' } );

const fLight = pane.addFolder({ title: 'Well Light' });
fLight.addBinding( params, 'wellRadius',   { min: 0.1,  max: 1.0,  label: 'Pool Size' } );
fLight.addBinding( params, 'wellLight',    { min: 0.0,  max: 1.5,  label: 'Brightness' } );
fLight.addBinding( params, 'wellDepth',    { min: 0.0,  max: 1.0,  label: 'Well Depth' } );
fLight.addBinding( params, 'shimmer',      { min: 0.0,  max: 0.4,  label: 'Shimmer' } );
fLight.addBinding( params, 'lightAngle',   { min: 0.0,  max: 6.28, label: 'Light Angle' } );

const paramsData = sg.uniform([ params.waveSpeed, params.damping, params.slack, 0.0 ]);
const u_frag     = sg.uniform([ 0.0, 0.0, params.pixelSize, params.noise ]); // time, textFade, pixelSize, noise
const u_light    = sg.uniform([ 0.6, 0.5, 0.6, params.heightScale ]);        // lightDir.xyz, heightScale
const u_well     = sg.uniform([ params.wellRadius, params.wellLight, params.wellDepth, params.shimmer ]);

// ---- passes ------------------------------------------------------------------
const renderPass = await sg.render({
    shader: render,
    data: [ res, pingpong, u_frag, u_light, textSampler, textTexture, u_well ],
    onframe: () => {
        const now = performance.now() / 1000;
        const since = now - dropTime;
        let fade = 0.0;
        if( since < HOLD )      fade = 1.0;
        else                    fade = Math.max( 0.0, 1.0 - ( since - HOLD ) / FADE );

        u_frag.value = [ now - startTime, fade, params.pixelSize, params.noise ];

        const a = params.lightAngle;
        u_light.value = [ Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.6, params.heightScale ];
        u_well.value  = [ params.wellRadius, params.wellLight, params.wellDepth, params.shimmer ];
    }
});

// fill the rain uniform with this frame's raindrops (and clear the rest)
function spawnRain() {
    for( let k = 0; k < RAIN_MAX; k++ ) {
        const base = k * 4;
        if( Math.random() < params.rainRate / RAIN_MAX ) {
            rainData[ base     ] = Math.random() * w;
            rainData[ base + 1 ] = Math.random() * h;
            rainData[ base + 2 ] = params.rainStrength * ( 0.6 + Math.random() * 0.8 );
            rainData[ base + 3 ] = params.rainRadius   * ( 0.7 + Math.random() * 0.6 );
        } else {
            rainData[ base + 2 ] = 0.0; // inactive slot
        }
    }
}

const computePass = sg.compute({
    shader: compute,
    data: [ res, pingpong, paramsData, u_drop, u_rain ],
    dispatchCount: [ Math.ceil( w / 8 ), Math.ceil( h / 8 ), 1 ],
    onframe: () => {
        paramsData.value = [ params.waveSpeed, params.damping, params.slack, 0.0 ];
        u_drop.value = dropData;
        spawnRain();
        u_rain.value = rainData;
    },
    onframeend: () => {
        dropData[2] = 0.0; // impulse lasts exactly one simulation step
    }
});

sg.run( computePass, renderPass );
