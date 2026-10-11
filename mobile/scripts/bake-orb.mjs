// Renders the orb shader (src/components/orb/orbShader.ts) to a PNG with headless Chromium,
// for iOS/Android, where the live WebGL orb isn't available.
//
//   npm i -D playwright && node scripts/bake-orb.mjs [out=assets/orb.png] [size=768]
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = process.argv[2] ?? 'assets/orb.png';
const size = Number(process.argv[3] ?? 768);
const time = Number(process.env.ORB_TIME ?? 3.0);
const src = fs.readFileSync(new URL('../src/components/orb/orbShader.ts', import.meta.url), 'utf8');
const grab = (name) => src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`))[1];
const html = `<canvas id="c" width="${size}" height="${size}"></canvas><script>
const gl = document.getElementById('c').getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true });
const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
const p = gl.createProgram();
gl.attachShader(p, sh(gl.VERTEX_SHADER, ${JSON.stringify(grab('ORB_VERT'))}));
gl.attachShader(p, sh(gl.FRAGMENT_SHADER, ${JSON.stringify(grab('ORB_FRAG'))}));
gl.linkProgram(p); gl.useProgram(p);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const a = gl.getAttribLocation(p, 'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
const u = (n) => gl.getUniformLocation(p, n);
gl.uniform1f(u('uTime'), ${time}); gl.uniform2f(u('uRot'), 0, 0); gl.uniform2f(u('uLight'), -0.45, 0.55);
gl.uniform1f(u('uEnergy'), ${Number(process.env.ORB_ENERGY ?? 0)}); gl.uniform1f(u('uPulse'), 0);
gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
window.done = true;
</script>`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: size, height: size } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setContent(`<body style="margin:0;background:transparent">${html}</body>`);
await page.waitForFunction(() => window.done === true || false, null, { timeout: 30000 }).catch(() => {});
if (errors.length) throw new Error(errors.join('\n'));
await page.locator('#c').screenshot({ path: path.resolve(out), omitBackground: true });
await browser.close();
console.log(`Wrote ${out} (${size}px)`);
