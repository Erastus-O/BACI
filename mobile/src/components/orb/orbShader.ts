// BACI's orb: a glassy blue sphere with dark smoke drifting inside.
// WebGL 1 (GLSL ES 1.0) so it runs on every browser. Used live on web (Orb.web.tsx) and
// baked to assets/orb.png for iOS/Android (scripts/bake-orb.mjs).

export const ORB_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const ORB_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;    // seconds
uniform vec2 uRot;      // drag rotation (radians)
uniform vec2 uLight;    // light direction in screen space, -1..1
uniform float uEnergy;  // 0 idle .. 1 speaking loudly
uniform float uPulse;   // 1 right after a tap, decays to 0

// Simplex noise 3D (Ashima Arts, MIT).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p = p * 1.9 + 1.7; a *= 0.45; }
  return s;
}

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float R = 0.78 * (1.0 + 0.035 * uEnergy + 0.04 * uPulse);
  vec2 q = uv / R;
  float r = length(q);

  // Soft blue glow around the sphere.
  vec3 haloCol = vec3(0.42, 0.60, 1.0);
  float halo = smoothstep(1.32, 0.98, r) * (0.22 + 0.45 * uEnergy + 0.35 * uPulse);

  if (r > 1.0) {
    gl_FragColor = vec4(haloCol * halo, halo);
    return;
  }

  float z = sqrt(1.0 - r * r);
  vec3 n = vec3(q, z);
  float t = uTime * (0.07 + 0.32 * uEnergy);
  mat3 m = rotY(uRot.x + t * 0.5) * rotX(uRot.y + sin(t * 0.7) * 0.15);

  // Smoke: bundles of long, near-parallel filaments with soft smoke around them. Each of the
  // four layers stretches the noise along its own direction (so strands are long and bundles
  // cross) and sits at a different depth in the sphere.
  float smoke = 0.0;
  float sheet = 0.0;
  for (int i = 0; i < 4; i++) {
    float d = float(i) / 3.0;
    float ang = float(i) * 1.9 + 0.4;
    mat3 dir = rotY(ang) * rotX(ang * 0.7);
    vec3 p = dir * (m * vec3(q, z * (0.9 - 1.8 * d))) * vec3(0.22, 0.62, 0.55) + vec3(d * 4.3, 0.0, 0.0);
    vec3 w = p + 0.55 * vec3(fbm(p * 0.8 + vec3(0.0, t, 0.0)), fbm(p * 0.8 + vec3(5.2, 1.3, -t)), fbm(p * 0.8 + vec3(1.7, t * 0.6, 9.2)));
    float f = fbm(w + vec3(t * 0.2, 0.0, 0.0));
    float bundle = 1.0 - smoothstep(0.0, 0.2, abs(f));
    float fibres = 1.0 - smoothstep(0.0, 0.17, abs(fract(f * 13.0 + 0.5) - 0.5));
    float fade = 1.0 - 0.4 * d;
    smoke += bundle * fibres * fade;
    sheet += bundle * bundle * fade;
  }
  smoke = clamp(smoke * 0.5 + sheet * 0.42, 0.0, 1.0);

  // Glassy blue body, lit from uLight.
  vec3 L = normalize(vec3(uLight, 0.85));
  float diff = dot(n, L) * 0.5 + 0.5;
  vec3 deep = vec3(0.07, 0.15, 0.48);
  vec3 mid = vec3(0.18, 0.38, 0.86);
  vec3 lite = vec3(0.50, 0.78, 1.0);
  vec3 col = mix(deep, mid, smoothstep(0.1, 0.8, diff));
  col = mix(col, lite, pow(diff, 4.0) * 0.6);

  vec3 strandCol = vec3(0.02, 0.05, 0.20);
  col = mix(col, strandCol, smoke * 0.78);

  // Fresnel rim with a hint of ice blue, and a soft specular highlight.
  float fres = pow(1.0 - z, 2.2);
  col = mix(col, vec3(0.66, 0.90, 1.0), fres * 0.5);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  col += pow(max(dot(n, H), 0.0), 60.0) * 0.18;
  col += vec3(0.70, 0.88, 1.0) * uEnergy * 0.10 * (1.0 - z);

  // Ripple after a tap.
  float ring = uPulse * smoothstep(0.12, 0.0, abs(r - (1.0 - uPulse)));
  col += vec3(0.78, 0.92, 1.0) * ring * 0.5;

  // Glass: slightly see-through at the rim, crisp edge.
  float edge = smoothstep(1.0, 0.975, r);
  float alpha = edge * mix(0.97, 0.80, fres);
  vec3 outCol = col * alpha + haloCol * halo * (1.0 - alpha);
  gl_FragColor = vec4(outCol, alpha + halo * (1.0 - alpha));
}
`;
