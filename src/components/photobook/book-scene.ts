import type * as THREE from 'three';

import type { PhotobookPaper } from '@/types/domain';

import { coverPreset, drawCoverFace, type CoverSubject, type Picture } from './covers';

/**
 * The book itself: a hardcover on a table, with pages that bend as they turn.
 *
 * Everything in here is Three.js, loaded only by `BookViewer` and only on the
 * book page, so no other route carries it. The geometry is deliberately plain:
 * two boards, a spine, and one plane per sheet, each sheet drawn twice (front
 * and back material) with a vertex shader injected into the standard material
 * so lighting and shadows stay real. A rigid rotation about the spine plus a
 * bulge along the page's normal is enough to read as paper; anything more
 * physical is more code for a difference nobody can see at this size.
 *
 * Nothing here knows about React. `createBookScene` builds the scene into a
 * container and returns the handful of verbs the viewer needs.
 */

export const PAPERS: Record<PhotobookPaper, { color: string; roughness: number; metalness: number; edge: string }> = {
  matte: { color: '#f4f2ec', roughness: 0.95, metalness: 0, edge: '#e7e3d8' },
  lustre: { color: '#f7f6f2', roughness: 0.55, metalness: 0.02, edge: '#e9e6de' },
  fineart: { color: '#efe8d6', roughness: 1.0, metalness: 0, edge: '#dfd6c0' },
};

const W = 1.0;
const H = 1.32;
const T = 0.0045;
const COVER_T = 0.028;
const MARGIN = 0.03;

export interface BookSceneOptions {
  container: HTMLElement;
  /** Page pictures in order; an odd count leaves the last verso blank. */
  pictures: readonly Picture[];
  paper: PhotobookPaper;
  cover: Parameters<typeof coverPreset>[0];
  subject: CoverSubject;
  tableColor: string;
  reducedMotion: boolean;
  onChange?: (state: { coverOpen: boolean; turned: number; sheets: number }) => void;
}

export interface BookScene {
  next(): Promise<void>;
  prev(): Promise<void>;
  close(): Promise<void>;
  dispose(): void;
}

interface Sheet {
  u: { theta: { value: number }; lift: { value: number }; bulge: { value: number } };
  flipped: number;
}

export async function createBookScene(options: BookSceneOptions): Promise<BookScene> {
  const T3 = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

  const { container, pictures, subject, reducedMotion } = options;
  const paper = PAPERS[options.paper];
  const preset = coverPreset(options.cover);
  const sheetCount = Math.max(1, Math.ceil(pictures.length / 2));

  const renderer = new T3.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  // The canvas fills its container; the drawing buffer follows in `resize`.
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new T3.Scene();
  const camera = new T3.PerspectiveCamera(30, 1, 0.05, 50);
  camera.position.set(0.12, 1.95, 2.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.4;
  controls.maxDistance = 4.6;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.38;
  controls.target.set(0, 0.05, 0);

  scene.add(new T3.HemisphereLight(0xffffff, 0x3a3326, 0.55));
  const key = new T3.DirectionalLight(0xfff4e0, 2.4);
  key.position.set(1.8, 3.6, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 10;
  key.shadow.camera.left = -2.5;
  key.shadow.camera.right = 2.5;
  key.shadow.camera.top = 2.5;
  key.shadow.camera.bottom = -2.5;
  key.shadow.bias = -0.0008;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new T3.DirectionalLight(0xd8e4ff, 0.5);
  fill.position.set(-2.5, 2, -1.5);
  scene.add(fill);

  const table = new T3.Mesh(
    new T3.PlaneGeometry(14, 14),
    new T3.MeshStandardMaterial({ color: new T3.Color(options.tableColor), roughness: 1 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const book = new T3.Group();
  scene.add(book);

  const disposables: Array<{ dispose(): void }> = [renderer, controls];

  function bendable<M extends THREE.Material>(mat: M, u: Sheet['u']): M {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTheta = u.theta;
      shader.uniforms.uLift = u.lift;
      shader.uniforms.uBulge = u.bulge;
      shader.uniforms.uW = { value: W };
      shader.vertexShader =
        'uniform float uTheta; uniform float uLift; uniform float uBulge; uniform float uW;\n' +
        shader.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
            { float c = cos(uTheta), s = sin(uTheta);
              objectNormal = vec3(objectNormal.x * c - objectNormal.y * s, objectNormal.x * s + objectNormal.y * c, objectNormal.z); }`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            { float c = cos(uTheta), s = sin(uTheta); float x = position.x;
              vec3 p = vec3(x * c, x * s, position.z);
              vec3 n = vec3(-s, c, 0.0);
              p += n * (sin(3.14159265 * x / uW) * uBulge * s);
              p.y += uLift; transformed = p; }`,
          );
    };
    mat.customProgramCacheKey = () => 'bend-' + mat.type;
    disposables.push(mat);
    return mat;
  }

  const sheetGeo = new T3.PlaneGeometry(W, H, 48, 1);
  sheetGeo.rotateX(-Math.PI / 2);
  sheetGeo.translate(W / 2, 0, 0);
  disposables.push(sheetGeo);

  function texture(source: HTMLCanvasElement): THREE.Texture {
    const t = new T3.CanvasTexture(source);
    t.colorSpace = T3.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    disposables.push(t);
    return t;
  }

  function pageCanvas(img: Picture | undefined): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = Math.round((768 * H) / W);
    const x = c.getContext('2d');
    if (!x) return c;
    x.fillStyle = paper.color;
    x.fillRect(0, 0, c.width, c.height);
    if (img) {
      const iw = img.width, ih = img.height;
      const r = Math.max(c.width / iw, c.height / ih);
      const sw = c.width / r, sh = c.height / r;
      x.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    }
    const g = x.createLinearGradient(0, 0, 60, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 60, c.height);
    return c;
  }

  // Covers.
  const edgeMat = new T3.MeshStandardMaterial({ color: preset.chip, roughness: 0.8 });
  const endpaper = new T3.MeshStandardMaterial({ color: paper.edge, roughness: 0.9 });
  const frontTex = texture(drawCoverFace('front', preset, subject, pictures));
  const backTex = texture(drawCoverFace('back', preset, subject, pictures));
  backTex.wrapS = T3.RepeatWrapping;
  backTex.repeat.x = -1;
  const boardGeo = new T3.BoxGeometry(W + MARGIN, COVER_T, H + MARGIN * 2);
  disposables.push(edgeMat, endpaper, boardGeo);

  const coverGroup = new T3.Group();
  const frontBoard = new T3.Mesh(boardGeo, [
    edgeMat, edgeMat,
    new T3.MeshStandardMaterial({ map: frontTex, roughness: 0.75 }),
    endpaper, edgeMat, edgeMat,
  ]);
  frontBoard.castShadow = true;
  frontBoard.receiveShadow = true;
  frontBoard.position.set((W + MARGIN) / 2, 0, 0);
  coverGroup.add(frontBoard);
  book.add(coverGroup);

  const backBoard = new T3.Mesh(boardGeo, [
    edgeMat, edgeMat, endpaper,
    new T3.MeshStandardMaterial({ map: backTex, roughness: 0.75 }),
    edgeMat, edgeMat,
  ]);
  backBoard.castShadow = true;
  backBoard.receiveShadow = true;
  backBoard.position.set((W + MARGIN) / 2, COVER_T / 2, 0);
  book.add(backBoard);

  const spineH = COVER_T * 2 + sheetCount * T * 2;
  const spine = new T3.Mesh(new T3.BoxGeometry(0.03, spineH, H + MARGIN * 2), edgeMat);
  spine.position.set(-0.015, spineH / 2, 0);
  spine.castShadow = true;
  book.add(spine);

  // Sheets.
  const sheets: Sheet[] = [];
  for (let i = 0; i < sheetCount; i++) {
    const u = { theta: { value: 0 }, lift: { value: 0 }, bulge: { value: 0.11 } };
    const texA = texture(pageCanvas(pictures[2 * i]));
    const texB = texture(pageCanvas(pictures[2 * i + 1]));
    texB.wrapS = T3.RepeatWrapping;
    texB.repeat.x = -1;
    const matA = bendable(new T3.MeshStandardMaterial({ map: texA, roughness: paper.roughness, metalness: paper.metalness, side: T3.FrontSide }), u);
    const matB = bendable(new T3.MeshStandardMaterial({ map: texB, roughness: paper.roughness, metalness: paper.metalness, side: T3.BackSide }), u);
    for (const mat of [matA, matB]) {
      const mesh = new T3.Mesh(sheetGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = bendable(new T3.MeshDepthMaterial({ depthPacking: T3.RGBADepthPacking }), u);
      book.add(mesh);
    }
    sheets.push({ u, flipped: 0 });
  }

  let coverOpen = 0;

  function layout(): void {
    for (let i = 0; i < sheetCount; i++) {
      const s = sheets[i]!;
      const right = COVER_T + T * (sheetCount - i);
      const left = COVER_T + T * (i + 1);
      s.u.theta.value = s.flipped * Math.PI;
      s.u.lift.value = right + (left - right) * s.flipped;
    }
    coverGroup.rotation.z = coverOpen * Math.PI;
    const closedY = COVER_T + sheetCount * T * 2 + COVER_T / 2;
    coverGroup.position.y = closedY + (COVER_T / 2 - closedY) * coverOpen;
    book.position.x = -(W / 2) * (1 - coverOpen);
    options.onChange?.({
      coverOpen: coverOpen >= 0.5,
      turned: sheets.filter((s) => s.flipped >= 0.999).length,
      sheets: sheetCount,
    });
  }

  // Animation.
  interface Tween { from: number; to: number; set: (v: number) => void; start: number; ms: number; resolve: () => void }
  const tweens: Tween[] = [];
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function tween(get: () => number, set: (v: number) => void, to: number, ms: number): Promise<void> {
    if (reducedMotion) { set(to); layout(); return Promise.resolve(); }
    return new Promise((resolve) => tweens.push({ from: get(), to, set, start: performance.now(), ms, resolve }));
  }
  let busy: Promise<void> = Promise.resolve();
  const queue = (fn: () => Promise<void>) => { busy = busy.then(fn).catch(() => undefined); return busy; };

  const next = () => queue(async () => {
    if (coverOpen < 1) { await tween(() => coverOpen, (v) => (coverOpen = v), 1, 1100); return; }
    const s = sheets.find((x) => x.flipped < 1);
    if (!s) return;
    await tween(() => s.flipped, (v) => (s.flipped = v), 1, 950);
  });
  const prev = () => queue(async () => {
    const s = [...sheets].reverse().find((x) => x.flipped > 0);
    if (s) { await tween(() => s.flipped, (v) => (s.flipped = v), 0, 950); return; }
    if (coverOpen > 0) await tween(() => coverOpen, (v) => (coverOpen = v), 0, 1100);
  });
  const close = () => queue(async () => {
    for (const s of [...sheets].reverse()) if (s.flipped > 0) await tween(() => s.flipped, (v) => (s.flipped = v), 0, 220);
    if (coverOpen > 0) await tween(() => coverOpen, (v) => (coverOpen = v), 0, 900);
  });

  // Input: a short tap on either half of the stage turns a page; a drag orbits.
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved > 6 || dt > 500) return;
    const r = renderer.domElement.getBoundingClientRect();
    if ((e.clientX - r.left) / r.width < 0.5) void prev(); else void next();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  function resize(): void {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let raf = 0;
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i]!;
      const k = Math.min(1, (now - t.start) / t.ms);
      t.set(t.from + (t.to - t.from) * ease(k));
      if (k >= 1) { tweens.splice(i, 1); t.resolve(); }
    }
    if (tweens.length) layout();
    controls.update();
    renderer.render(scene, camera);
  }
  layout();
  raf = requestAnimationFrame(frame);

  return {
    next,
    prev,
    close,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      for (const d of disposables) d.dispose();
      renderer.domElement.remove();
    },
  };
}
