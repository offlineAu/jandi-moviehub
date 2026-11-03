'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useMotionOff } from './use-motion-off';

/*
 * Iris field: a slow, domain-warped light field in the brand's violet / magenta / cyan, like
 * projector light through haze. One full-screen triangle and a fragment shader, rendered at
 * reduced resolution. Pauses off-screen and when the tab is hidden; reduced motion renders one
 * still frame. Without WebGL the CSS gradient underneath is the whole effect.
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uIntensity;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes.xy) / min(uRes.x, uRes.y);
  float t = uTime * 0.045;

  // Domain warp: two layers of fbm bend the field into ribbons.
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t)), fbm(p * 1.4 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p * 1.8 + 3.0 * q + vec2(1.7, 9.2) + t * 1.3),
                fbm(p * 1.8 + 3.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p * 1.2 + 2.6 * r);

  // Pointer leaves a soft bloom.
  float bloom = smoothstep(0.65, 0.0, distance(uv, uPointer)) * 0.35;

  vec3 ink    = vec3(0.031, 0.031, 0.063);   // --background
  vec3 violet = vec3(0.576, 0.200, 0.918);   // --primary-strong
  vec3 magenta= vec3(0.859, 0.153, 0.467);   // --accent-strong
  vec3 cyan   = vec3(0.220, 0.741, 0.973);   // --iris
  vec3 lilac  = vec3(0.769, 0.710, 0.992);

  vec3 col = mix(ink, violet, smoothstep(0.25, 0.85, f));
  col = mix(col, magenta, smoothstep(0.45, 1.0, r.x) * 0.75);
  col = mix(col, cyan, smoothstep(0.55, 1.0, q.y) * 0.45);
  col += lilac * pow(f, 6.0) * 0.6;
  col += mix(violet, magenta, uv.x) * bloom;

  // Vignette toward the page ground so edges never draw a seam.
  float vig = smoothstep(1.25, 0.2, length(p * vec2(0.9, 1.15)));
  col = mix(ink, col, vig * uIntensity);

  // Film grain.
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function IrisField({
  className,
  intensity = 1,
  resolution = 0.5,
}: {
  className?: string;
  /** 0–1: how far the light reaches out of the ground colour. */
  intensity?: number;
  /** Render scale (0.35–1). Lower is cheaper; the field is soft so 0.5 is plenty. */
  resolution?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const off = useMotionOff();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uPointer = gl.getUniformLocation(prog, 'uPointer');
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity');
    gl.uniform1f(uIntensity, intensity);

    const pointer = { x: 0.7, y: 0.6, tx: 0.7, ty: 0.6 };
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * resolution;
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };
    resize();

    let raf = 0;
    let visible = true;
    const start = performance.now() - Math.random() * 60_000;
    const draw = (now: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      cancelAnimationFrame(raf);
      if (off) draw(start + 20_000);
      else if (visible && !document.hidden) raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (off) draw(start + 20_000);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) play();
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);
    const onVis = () => play();
    document.addEventListener('visibilitychange', onVis);
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = (e.clientX - r.left) / r.width;
      pointer.ty = 1 - (e.clientY - r.top) / r.height;
    };
    if (!off) window.addEventListener('pointermove', onPointer, { passive: true });

    play();
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onPointer);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [off, intensity, resolution]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(60%_50%_at_20%_10%,rgb(147_51_234/0.35),transparent_70%),radial-gradient(50%_45%_at_90%_90%,rgb(219_39_119/0.25),transparent_70%),radial-gradient(40%_35%_at_70%_30%,rgb(56_189_248/0.12),transparent_70%),var(--background)]',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          'size-full transition-opacity duration-[1200ms] ease-[var(--ease-expo)]',
          ready ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
