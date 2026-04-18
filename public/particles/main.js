import { default as seagulls } from '../gulls/gulls.js';
import { Pane } from 'https://esm.sh/tweakpane';
// Using my reaction diffusion code as a starter for this one

const sg      = await seagulls.init(),
    frag    = await seagulls.import( './frag.wgsl' ),
    compute = await seagulls.import( './compute.wgsl' ),
    vertex         = await seagulls.import( './vertex.wgsl' ),
    render  = vertex + frag,
    w = sg.width,
    h = sg.height,
    size    = (w * h),
    state   = new Float32Array( 7200) // state of 600 particles with 12 floats per



const statebuffer1 = sg.buffer( state )
const statebuffer2 = sg.buffer( state )
const res = sg.uniform([ w, h ])
let nextParticle = 0;
let mouseData = [-100.0, -100.0, 0.0, 0.0]; // X, Y, mouseDown, particleIndex
const u_mouse = sg.uniform(mouseData);

window.addEventListener('mousedown', function(e){
    mouseData[2] = 1.0;
    mouseData[1] = e.clientY;
    mouseData[0] = e.clientX;
    nextParticle = (nextParticle + 1. * params.amt) % 600.;
    mouseData[3] = nextParticle;
});

window.addEventListener('mousemove', function(e){
    if(mouseData[2] === 1.0) { // if mouse is dragging keep track of position
        mouseData[1] = e.clientY;
        mouseData[0] = e.clientX;
        nextParticle = (nextParticle + 1. * params.amt) % 600.;
        mouseData[3] = nextParticle;
    }
});

window.addEventListener('mouseup', function(){
    mouseData[2] = 0.0;
})

const params = {
    velx: 0.01,
    vely: 0.01,
    lifespan: 5.0,
    amt: 1.0,
    gravity: 0.005
};

const pane = new Pane();
pane.addBinding(params, 'velx', {min: 0.0, max: 0.3, label: 'Velocity X' });
pane.addBinding(params, 'vely', {min: 0.0, max: 0.3, label: 'Velocity Y' });
pane.addBinding(params, 'lifespan', {min: 0.01, max: 100.0, label: 'Lifespan' });
pane.addBinding(params, 'amt', {min: 0.01, max: 50.0, label: 'Amount' });
pane.addBinding(params, 'gravity', {min: -0.01, max: .01, label: 'Gravity' });
const paramsData = sg.uniform([
    params.velx,
    params.vely,
    params.lifespan,
    params.amt,
    params.gravity,
]);

const pingpong = sg.pingpong( statebuffer1, statebuffer2 );
const renderPass = await sg.render({
    shader: render,
    data: [
        res,
        pingpong
    ],
    count: 600,
})

const computePass = sg.compute({
    shader: compute,
    data: [ res, pingpong, paramsData, u_mouse ],
    dispatchCount:  [10, 1, 1],
    onframe: () => {
        paramsData.value = [
            params.velx,
            params.vely,
            params.lifespan,
            params.amt,
            params.gravity,
        ];
        u_mouse.value = mouseData;
    }
})

sg.run( computePass, renderPass )
