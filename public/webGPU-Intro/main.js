import { default as gulls } from '/gulls/gulls.js'
import { default as Video    } from '/gulls/helpers/video.js'

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

const render = await sg.render({
  shader,
  data:[
    sg.uniform([ sg.width, sg.height ]),
    sg.sampler(),
    feedback_t,
    u_time,
    u_mouse,
    sg.video( Video.element )
  ],
  copy: feedback_t,

  onframe: () => {
    u_time.value = performance.now() / 1000.0;
    u_mouse.value = [mouseX, mouseY];
  }
})

sg.run( render )
