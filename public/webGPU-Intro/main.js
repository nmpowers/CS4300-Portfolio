import { default as gulls } from '/gulls/gulls.js'
import { default as Video    } from '/gulls/helpers/video.js'
import { Pane } from 'https://esm.sh/tweakpane';

const sg     = await gulls.init(),
      frag   = await gulls.import( './frag.wgsl' ),
      shader = gulls.constants.vertex + frag

await Video.init()

const back = new Float32Array( gulls.width * gulls.height * 4 )
const feedback_t = sg.texture( back )

const u_time = sg.uniform(0.0);
const u_mouse = sg.uniform([0.5, 0.5]);
let mouseX = 0.5;
let mouseY = 0.5;

// mouse coords
window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX / window.innerWidth;
  mouseY = e.clientY / window.innerHeight;
});

// tweak pane stuff
const paneParams= {
  noiseSpeed: 0.2,
  gridScale: 9.0,
  warpAmt: 0.1,
  avoidance: 0.8,
};

const pane = new Pane();
pane.addBinding(paneParams, 'noiseSpeed', { min: 0.0, max: 2.0, label: 'Noise Speed' });
pane.addBinding(paneParams, 'gridScale',  { min: 1.0, max: 20.0, label: 'Grid Scale' });
pane.addBinding(paneParams, 'warpAmt', { min: 0.0, max: 1.0, label: 'Cell Warp' });
pane.addBinding(paneParams, 'avoidance',  { min: -2.0, max: 3.0, label: 'Mouse Avoidance' });

const u_pane_params = sg.uniform([
  paneParams.noiseSpeed,
  paneParams.gridScale,
  paneParams.warpAmt,
  paneParams.avoidance
]);

const render = await sg.render({
  shader,
  data:[
    sg.uniform([ sg.width, sg.height ]),
    sg.sampler(),
    feedback_t,
    u_time,
    u_mouse,
    u_pane_params,
    sg.video( Video.element )
  ],
  copy: feedback_t,

  onframe: () => {
    u_time.value = performance.now() / 1000.0;
    u_mouse.value = [mouseX, mouseY];
    u_pane_params.value = [
      paneParams.noiseSpeed,
      paneParams.gridScale,
      paneParams.warpAmt,
      paneParams.avoidance
    ];
  }
})

sg.run( render )
