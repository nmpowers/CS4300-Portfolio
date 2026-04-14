import { default as seagulls } from '../gulls/gulls.js';
import { Pane } from 'https://esm.sh/tweakpane';

const sg      = await seagulls.init(),
    frag    = await seagulls.import( './frag.wgsl' ),
    compute = await seagulls.import( './compute.wgsl' ),
    render  = seagulls.constants.vertex + frag,
    w = sg.width,
    h = sg.height,
    size    = (w * h),
    state   = new Float32Array( size * 2)

for( let i = 0; i < size; i++ ) { // filling each spot with a concentration of A and B instead of random values
    state[ i * 2 ] = 1.0; // A substance
    state[i * 2 + 1] = 0.0; // B substance
}

const centerX = Math.floor(w / 2);
const centerY = Math.floor(h / 2);
const seed = 20;
for (let y = centerY - seed; y < centerY + seed; y++){
    for (let x = centerX - seed; x < centerX + seed; x++){
        const i = y * w + x;
        state[ i * 2 + 1 ] = 1.0; // put seed of B in couple of spots
    }
}


const statebuffer1 = sg.buffer( state )
const statebuffer2 = sg.buffer( state )
const res = sg.uniform([ w, h ])
let mouseData = [-100.0, -100.0, 0.0, 10.0]; // X, Y, mouseDown, brushSize
const u_mouse = sg.uniform(mouseData);

window.addEventListener('mousedown', function(e){
    mouseData[2] = 1.0;
    mouseData[1] = e.clientY;
    mouseData[0] = e.clientX;
});

window.addEventListener('mousemove', function(e){
    if(mouseData[2] === 1.0) { // if mouse is dragging keep track of position
        mouseData[1] = e.clientY;
        mouseData[0] = e.clientX;
    }
});

window.addEventListener('mouseup', function(){
    mouseData[2] = 0.0;
})

const params = {
    Da: 1.0,
    Db: 0.5,
    feed_rate: 0.055,
    kill_rate: 0.062,
    stretchX: 1.5,
    stretchY: 0.5,
};

const pane = new Pane();
pane.addBinding(params, 'Da', {min: 0.0, max: 1.0, label: 'Diffusion A' });
pane.addBinding(params, 'Db', {min: 0.0, max: 1.0, label: 'Diffusion B' });
pane.addBinding(params, 'feed_rate', {min: 0.01, max: 1.0, label: 'Feed Rate' });
pane.addBinding(params, 'kill_rate', {min: 0.01, max: 1.0, label: 'Kill rate' });
pane.addBinding(params, 'stretchX', { min: 0.1, max: 3.0, label: 'Stretch X' });
pane.addBinding(params, 'stretchY', { min: 0.1, max: 3.0, label: 'Stretch Y' });
const paramsData = sg.uniform([
    params.Da,
    params.Db,
    params.feed_rate,
    params.kill_rate,
    params.stretchX,
    params.stretchY,
    0.0, 0.0
]);

const pingpong = sg.pingpong( statebuffer1, statebuffer2 );
const renderPass = await sg.render({
    shader: render,
    data: [
        res,
        pingpong
    ]
})

const computePass = sg.compute({
    shader: compute,
    data: [ res, pingpong, paramsData, u_mouse ],
    dispatchCount:  [Math.ceil(w / 8), Math.ceil(h/8), 1],
    onframe: () => {
        paramsData.value = [
            params.Da,
            params.Db,
            params.feed_rate,
            params.kill_rate,
            params.stretchX,
            params.stretchY,
            0.0, 0.0
        ];
        u_mouse.value = mouseData;
    }
})

sg.run( computePass, renderPass )
