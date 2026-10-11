import { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ORB_FRAG, ORB_VERT } from './orbShader';
import { OrbImage } from './OrbImage';
import { OrbProps, stateEnergy } from './types';

export type { OrbProps, OrbState } from './types';

/**
 * Web: the orb rendered live with WebGL.
 * - Pointer: the light follows the cursor/finger.
 * - Drag: spins the smoke inside, with inertia.
 * - Tap/click/Enter: ripple (and `onPress`).
 * - State and `level`: listening breathes, speaking swells and speeds up with the voice.
 * Small or non-interactive orbs, and browsers without WebGL, use the baked image instead.
 */
export function Orb(props: OrbProps) {
  const [webgl] = useState(() => typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl'));
  if (!webgl || props.size < 72) return <OrbImage {...props} interactive={props.size >= 72 && props.interactive !== false} />;
  return <OrbCanvas {...props} />;
}

function OrbCanvas({ size, state = 'idle', level, onPress, interactive = true, accessibilityLabel }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Live inputs read by the render loop without restarting it.
  const live = useRef({ state, level, onPress, interactive });
  live.current = { state, level, onPress, interactive };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!canvas || !gl) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, ORB_VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, ORB_FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uTime = u('uTime'), uRot = u('uRot'), uLight = u('uLight'), uEnergy = u('uEnergy'), uPulse = u('uPulse');
    gl.clearColor(0, 0, 0, 0);

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const sim = {
      time: Math.random() * 20,
      rot: [0, 0],
      vel: [0.0, 0.0],
      light: [-0.45, 0.55],
      lightTarget: [-0.45, 0.55],
      energy: 0,
      pulse: 0,
    };

    // ---- Input ----
    let dragging = false;
    let moved = 0;
    let last = [0, 0];
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
    };
    const onDown = (e: PointerEvent) => {
      if (!live.current.interactive) return;
      dragging = true;
      moved = 0;
      last = [e.clientX, e.clientY];
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const [x, y] = local(e);
      sim.lightTarget = [Math.max(-1, Math.min(1, x)) * 0.9, Math.max(-1, Math.min(1, y)) * 0.9];
      if (!dragging) return;
      const dx = e.clientX - last[0];
      const dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      moved += Math.abs(dx) + Math.abs(dy);
      sim.vel = [dx * 0.012, dy * 0.012];
      sim.rot[0] += dx * 0.012;
      sim.rot[1] += dy * 0.012;
    };
    const tap = () => {
      sim.pulse = 1;
      live.current.onPress?.();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (moved < 8) tap();
    };
    const onLeave = () => {
      if (!dragging) sim.lightTarget = [-0.45, 0.55];
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tap();
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('keydown', onKey);

    // ---- Render loop (paused when off-screen or the tab is hidden) ----
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
    });
    io.observe(canvas);
    let raf = 0;
    let prev = performance.now();
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const { state: st = 'idle', level: lv } = live.current;
      const audio = lv ? Math.min(1, Math.max(0, lv())) : 0;
      const target = stateEnergy[st] + audio * (st === 'speaking' ? 0.7 : 0.4);
      sim.energy += (target - sim.energy) * Math.min(1, dt * 6);
      const breath = 0.05 * Math.sin(now / 1000 * (1.4 + sim.energy * 2));
      if (!reduceMotion) sim.time += dt * (1 + sim.energy * 2.5);
      if (!dragging) {
        sim.rot[0] += sim.vel[0];
        sim.rot[1] += sim.vel[1];
        sim.vel[0] *= 0.94;
        sim.vel[1] *= 0.94;
        sim.rot[1] *= 0.985; // tilt eases back to level
      }
      sim.light[0] += (sim.lightTarget[0] - sim.light[0]) * Math.min(1, dt * 5);
      sim.light[1] += (sim.lightTarget[1] - sim.light[1]) * Math.min(1, dt * 5);
      sim.pulse = Math.max(0, sim.pulse - dt * 1.4);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, sim.time);
      gl.uniform2f(uRot, sim.rot[0], sim.rot[1]);
      gl.uniform2f(uLight, sim.light[0], sim.light[1]);
      gl.uniform1f(uEnergy, Math.max(0, sim.energy + (reduceMotion ? 0 : breath)));
      gl.uniform1f(uPulse, sim.pulse);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (visible && document.visibilityState === 'visible') schedule();
    };
    const onVisibility = () => document.visibilityState === 'visible' && schedule();
    document.addEventListener('visibilitychange', onVisibility);
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('keydown', onKey);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [size]);

  return (
    <View style={{ width: size, height: size }}>
      {createElement('canvas', {
        ref: canvasRef,
        role: onPress ? 'button' : 'img',
        'aria-label': accessibilityLabel ?? (onPress ? 'Talk to BACI' : 'BACI'),
        tabIndex: interactive ? 0 : -1,
        style: { width: size, height: size, display: 'block', touchAction: 'none', cursor: interactive ? (onPress ? 'pointer' : 'grab') : 'default', outlineOffset: 4, borderRadius: '50%' },
      })}
    </View>
  );
}
