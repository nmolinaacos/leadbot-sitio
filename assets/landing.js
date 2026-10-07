// Leadbot: la historia del inicio contada con el scroll.
// - Lenis suaviza el scroll; GSAP + ScrollTrigger fijan cada acto y animan el DOM.
// - Three.js dibuja la escena de fondo: un núcleo de luz (el bot) y burbujas
//   de chat que cambian de forma en cada acto (estado 0..4, ver data-estado):
//   0 orbitan · 1 caos de la noche · 2 tres anillos (los canales) ·
//   3 fluyen en espiral hacia el núcleo · 4 halo tranquilo y lejano, para leer.
// Con movimiento reducido o sin WebGL la página se ve completa y estática.
import * as THREE from 'three';

const { gsap, ScrollTrigger, Lenis } = window;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;
const modest = small || (navigator.hardwareConcurrency || 8) <= 4;

let scrollState = () => 0;

// El arranque va al final del archivo: los shaders (const) se definen abajo.


// ── Scroll suave y anclas ────────────────────────────────────────────
function setupScroll() {
  const lenis = Lenis ? new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 }) : null;
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// Envuelve cada palabra en un span (las <em> quedan enteras, como una sola pieza).
function splitWords(element) {
  const pieces = [];
  [...element.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) fragment.append(part);
        else {
          const span = document.createElement('span');
          span.className = 'palabra';
          span.textContent = part;
          fragment.append(span);
          pieces.push(span);
        }
      });
      node.replaceWith(fragment);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const span = document.createElement('span');
      span.className = 'palabra';
      node.replaceWith(span);
      span.append(node);
      pieces.push(span);
    }
  });
  return pieces;
}

// ── Acto 0: la promesa ───────────────────────────────────────────────
function setupHero() {
  const words = splitWords(document.querySelector('[data-palabras]'));
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.25 });
  tl.fromTo(words, { opacity: 0, yPercent: 60, rotateX: -50, filter: 'blur(8px)' }, { opacity: 1, yPercent: 0, rotateX: 0, filter: 'blur(0px)', duration: 1.4, stagger: 0.06, clearProps: 'filter' })
    .fromTo('.hero .kicker', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1 }, 0.1)
    .fromTo(['.hero .bajada', '.hero .acciones'], { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.2, stagger: 0.12 }, '-=0.9');
  // Al bajar, el titular se aleja hacia el fondo.
  gsap.to('.hero-contenido', {
    yPercent: -25, opacity: 0, scale: 0.97, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.desliza', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '20% top', scrub: true } });
}

// ── Acto 1: la noche ─────────────────────────────────────────────────
function setupNight() {
  const clock = document.querySelector('.reloj-hora');
  const ampm = document.querySelector('.reloj-ampm');
  const count = document.querySelector('.contador-num');
  const time = { minutes: 0, messages: 0 };
  const render = () => {
    const total = (23 * 60 + 47 + Math.round(time.minutes)) % (24 * 60);
    const h24 = Math.floor(total / 60);
    const h12 = h24 % 12 || 12;
    clock.textContent = `${h12}:${String(total % 60).padStart(2, '0')}`;
    ampm.innerHTML = h24 >= 12 ? 'p.&nbsp;m.' : 'a.&nbsp;m.';
    count.textContent = Math.round(time.messages);
  };
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '.noche .pin', start: 'top top', end: '+=190%', scrub: 0.8, pin: true },
  });
  tl.fromTo('.reloj', { scale: 0.86, opacity: 0.4 }, { scale: 1, opacity: 1, duration: 0.25 }, 0)
    .to(time, { minutes: 146, duration: 1, onUpdate: render }, 0)
    .to(time, { messages: 47, duration: 0.85, onUpdate: render }, 0.1)
    .fromTo('.noche .linea', { opacity: 0, y: 40, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.18, stagger: 0.16 }, 0.08)
    .fromTo('.avisos li', { opacity: 0, scale: 0.7, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.12, stagger: 0.12, ease: 'back.out(2)' }, 0.25)
    .to('.noche .pin', { opacity: 0, scale: 0.94, duration: 0.12 }, 0.9);
}

// ── Acto 2: la respuesta ─────────────────────────────────────────────
function setupReply() {
  const steps = gsap.utils.toArray('.paso');
  const messages = gsap.utils.toArray('.chat .msg');
  // Los mensajes entran creciendo desde altura 0, como en un chat real.
  const sizes = messages.map((m) => {
    const style = getComputedStyle(m);
    return { pt: style.paddingTop, pb: style.paddingBottom };
  });
  gsap.set(messages, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, opacity: 0, overflow: 'hidden' });
  gsap.set('.chat', { gap: 0 });

  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    scrollTrigger: { trigger: '.respuesta .pin', start: 'top top', end: '+=280%', scrub: 0.8, pin: true },
  });
  const show = (i, at) =>
    tl.to(messages[i], { height: 'auto', paddingTop: sizes[i].pt, paddingBottom: sizes[i].pb, marginTop: 8, opacity: 1, duration: 0.07 }, at);
  const hide = (i, at) => tl.to(messages[i], { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, opacity: 0, duration: 0.05 }, at);
  const focus = (index, at) =>
    tl.to(steps, { opacity: (i) => (i === index ? 1 : 0.28), x: (i) => (i === index ? 0 : -6), duration: 0.06 }, at);

  tl.fromTo('.telefono', { rotateY: -24, rotateX: 10, y: 60, opacity: 0 }, { rotateY: -8, rotateX: 4, y: 0, opacity: 1, duration: 0.12 }, 0)
    .fromTo('.pasos', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.1 }, 0.02);
  focus(0, 0.05);
  show(0, 0.1); // cliente pregunta
  show(1, 0.18); // escribiendo…
  hide(1, 0.26);
  show(2, 0.27); // el bot responde
  focus(1, 0.38);
  show(3, 0.42); // foto
  show(4, 0.5); // precio
  show(5, 0.58); // catálogo PDF
  focus(2, 0.68);
  show(6, 0.72); // "me la llevo"
  show(7, 0.8); // resumen del pedido
  tl.to('.telefono', { rotateY: 6, rotateX: 0, duration: 0.9, ease: 'none' }, 0.1)
    .to('.respuesta .pin', { opacity: 0, y: -40, duration: 0.08 }, 0.94);
}

// ── Acto 3: una bandeja ──────────────────────────────────────────────
function setupInbox() {
  // En el celular las tarjetas se abren menos, para que quepan.
  const spread = innerWidth < 700 ? 30 : 88;
  const drop = innerWidth < 700 ? 34 : 18;
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: '.bandeja .pin', start: 'top top', end: '+=150%', scrub: 0.8, pin: true },
  });
  tl.fromTo('.bandeja-titulo', { opacity: 0, y: 50, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.25 }, 0)
    .fromTo('.t-wa', { xPercent: -260, z: -500, rotateY: 60, opacity: 0 }, { xPercent: -spread, z: 0, rotateY: 12, rotateZ: -5, y: drop, opacity: 1, duration: 0.4 }, 0.12)
    .fromTo('.t-ms', { xPercent: 260, z: -500, rotateY: -60, opacity: 0 }, { xPercent: spread, z: 0, rotateY: -12, rotateZ: 5, y: drop, opacity: 1, duration: 0.4 }, 0.18)
    .fromTo('.t-ig', { yPercent: 160, z: -700, rotateX: -70, opacity: 0 }, { yPercent: 0, z: 60, rotateX: 0, opacity: 1, duration: 0.4 }, 0.26)
    .fromTo('.bandeja-nota', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.2 }, 0.6)
    .to('.bandeja .pin', { opacity: 0, scale: 0.96, duration: 0.1 }, 0.92);
}

// ── Acto 4: qué hace (aparecen y se inclinan con el mouse) ───────────
function setupFeatures() {
  gsap.fromTo('.seccion-titulo', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.seccion-titulo', start: 'top 85%' } });
  ScrollTrigger.batch('.tile', {
    start: 'top 88%',
    onEnter: (batch) => gsap.fromTo(batch, { opacity: 0, y: 70, rotateX: -18 }, { opacity: 1, y: 0, rotateX: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }),
  });
  if (matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.tile').forEach((tile) => {
      tile.addEventListener('pointermove', (event) => {
        const r = tile.getBoundingClientRect();
        const x = (event.clientX - r.left) / r.width - 0.5;
        const y = (event.clientY - r.top) / r.height - 0.5;
        gsap.to(tile, { rotateY: x * 10, rotateX: -y * 10, transformPerspective: 900, duration: 0.5, ease: 'power2.out' });
      });
      tile.addEventListener('pointerleave', () => gsap.to(tile, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' }));
    });
  }
}

// ── Acto 5: la frase se ilumina palabra por palabra ──────────────────
function setupPhrase() {
  const words = splitWords(document.querySelector('[data-resaltar]'));
  gsap.fromTo(words, { opacity: 0.14 }, {
    opacity: 1, stagger: 0.05, ease: 'none',
    scrollTrigger: { trigger: '.frase', start: 'top 70%', end: 'bottom 60%', scrub: true },
  });
}

// ── Acto 6: cierre ───────────────────────────────────────────────────
function setupClosing() {
  gsap.fromTo('.cierre > *', { opacity: 0, y: 50, scale: 0.96 }, {
    opacity: 1, y: 0, scale: 1, stagger: 0.1, duration: 1.2, ease: 'expo.out',
    scrollTrigger: { trigger: '.cierre', start: 'top 65%' },
  });
}

// El estado de la escena 3D según el scroll: cada acto mantiene su estado
// mientras está en pantalla y cambia al pasar al siguiente.
function setupStateAnchors() {
  let anchors = [];
  const compute = () => {
    const vh = innerHeight;
    anchors = [];
    document.querySelectorAll('[data-estado]').forEach((section) => {
      const value = Number(section.dataset.estado);
      // La altura ya incluye el espacio extra de las secciones fijadas (pin-spacer).
      const box = section.getBoundingClientRect();
      const top = box.top + scrollY;
      const bottom = top + box.height;
      anchors.push([top - vh * 0.55, value], [Math.max(top - vh * 0.55, bottom - vh * 0.95), value]);
    });
    anchors.sort((a, b) => a[0] - b[0]);
  };
  ScrollTrigger.addEventListener('refresh', compute);
  compute();
  return () => {
    const y = scrollY;
    if (!anchors.length || y <= anchors[0][0]) return anchors[0]?.[1] ?? 0;
    for (let i = 1; i < anchors.length; i++) {
      const [y1, v1] = anchors[i];
      if (y <= y1) {
        const [y0, v0] = anchors[i - 1];
        return y1 === y0 ? v1 : v0 + (v1 - v0) * ((y - y0) / (y1 - y0));
      }
    }
    return anchors[anchors.length - 1][1];
  };
}

// ── Escena 3D ────────────────────────────────────────────────────────
function setupScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return; // Sin WebGL: queda el degradado del CSS.
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, modest ? 1.25 : 1.6));
  renderer.setClearColor(0x04060c, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04060c, 0.035);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  camera.position.set(0, 0, 14);

  // Polvo de estrellas.
  const starCount = modest ? 700 : 1600;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 14 + Math.random() * 34;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.6, r * Math.sin(phi) * Math.sin(theta) - 10], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0x9fb4ff, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(stars);

  // El núcleo: una esfera viva con brillo en el borde.
  const coreUniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 0.7 },
    uColorA: { value: new THREE.Color() },
    uColorB: { value: new THREE.Color() },
  };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, modest ? 20 : 48),
    new THREE.ShaderMaterial({ uniforms: coreUniforms, vertexShader: CORE_VERTEX, fragmentShader: CORE_FRAGMENT }),
  );
  scene.add(core);
  const shell = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.25, 1)),
    new THREE.LineBasicMaterial({ color: 0x8eaaff, transparent: true, opacity: 0.18 }),
  );
  scene.add(shell);
  // Halo de luz detrás del núcleo (en vez de un bloom, que aclaraba todo el fondo).
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 256;
  const hctx = haloCanvas.getContext('2d');
  const gradient = hctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  hctx.fillStyle = gradient;
  hctx.fillRect(0, 0, 256, 256);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas), color: 0x4a78ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(9);
  scene.add(halo);

  // Las burbujas de chat.
  const count = modest ? 70 : 130;
  const bubbleGeometry = new THREE.CapsuleGeometry(0.12, 0.3, 4, 12);
  bubbleGeometry.rotateZ(Math.PI / 2);
  const bubbles = new THREE.InstancedMesh(bubbleGeometry, new THREE.MeshBasicMaterial({ color: 0xc4ceff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), count);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(bubbles);
  const seeds = Array.from({ length: count }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
  const ringOf = (i) => i % 3;
  const ringSize = [Math.ceil(count / 3), Math.ceil((count - 1) / 3), Math.floor(count / 3)];
  const ringTilt = [new THREE.Euler(1.15, 0.1, 0.2), new THREE.Euler(1.45, -0.5, -0.1), new THREE.Euler(1.75, 0.6, 0.15)];

  const palette = {
    accent: new THREE.Color(0x8eaaff), white: new THREE.Color(0xffffff), alert: new THREE.Color(0xff5368), amber: new THREE.Color(0xffb547),
    wa: new THREE.Color(0x3fd68f), ig: new THREE.Color(0xff7ab0), ms: new THREE.Color(0x69b4ff), warm: new THREE.Color(0xffc56b),
  };
  // Por estado: posición del núcleo (x se escala en pantallas angostas), cámara, energía y colores.
  const STATES = [
    { core: [4.2, 0.1, -1], cam: 14, energy: 0.75, a: 0x3a62ff, b: 0x9a7bff, shell: 0.2 },
    { core: [0, 0, -3], cam: 16, energy: 0.12, a: 0x5a1020, b: 0x1a0a14, shell: 0.04 },
    { core: [3.4, 0, -3], cam: 13, energy: 1, a: 0x2f6bff, b: 0x48e0ff, shell: 0.28 },
    { core: [0, -0.2, 0], cam: 11.5, energy: 0.95, a: 0x4a78ff, b: 0xffb547, shell: 0.22 },
    { core: [0, -4.2, -9], cam: 15, energy: 0.55, a: 0x3a62ff, b: 0xffb547, shell: 0.1 },
  ].map((s) => ({ ...s, a: new THREE.Color(s.a), b: new THREE.Color(s.b) }));

  // Cuánto baja el núcleo en el celular en cada estado.
  const MOBILE_LIFT = [-5.4, 0, -0.5, 0, 0];
  if (small) bubbles.material.opacity = 0.5;
  const dummy = new THREE.Object3D();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const colA = new THREE.Color();
  const colB = new THREE.Color();
  const corePos = new THREE.Vector3();
  const coreFrom = new THREE.Vector3();
  const coreTo = new THREE.Vector3();
  const posTo = new THREE.Vector3();
  const TAU = Math.PI * 2;

  function bubblePosition(state, i, t, out, coreAt) {
    const [r1, r2, r3, r4] = seeds[i];
    if (state === 0) {
      const a = r1 * TAU + t * (0.06 + 0.1 * r2);
      const rad = 2.3 + r3 * 1.9;
      out.set(Math.cos(a) * rad, (r4 - 0.5) * 2.4 + Math.sin(t * 0.6 + r1 * 9) * 0.2, Math.sin(a) * rad).applyEuler(ringTilt[0]).multiplyScalar(0.9);
      out.y *= 0.55;
      return out.add(coreAt);
    }
    if (state === 1) {
      return out.set(
        (r1 - 0.5) * 24 + Math.sin(t * 0.25 + r4 * 20) * 0.8,
        (r2 - 0.5) * 13 + Math.cos(t * 0.3 + r1 * 20) * 0.6,
        (r3 - 0.5) * 12 - 3,
      );
    }
    if (state === 2) {
      const ring = ringOf(i);
      const index = Math.floor(i / 3);
      const a = (index / ringSize[ring]) * TAU + t * 0.16 * (ring === 1 ? -1 : 1);
      const rad = [2.4, 3.2, 4.0][ring];
      return out.set(Math.cos(a) * rad, Math.sin(a) * rad, 0).applyEuler(ringTilt[ring]).add(coreAt);
    }
    if (state === 3) {
      const p = (r1 + t * 0.06) % 1;
      const rad = 0.4 + (1 - p) * 6.2;
      const a = p * 13 + r2 * TAU;
      return out.set(Math.cos(a) * rad, (1 - p) * 4.2 - 1.2 + (r3 - 0.5) * 0.6, Math.sin(a) * rad * 0.7).add(coreAt);
    }
    const a = r1 * TAU + t * 0.035;
    const rad = 6.8 + r3 * 2.2;
    return out.set(Math.cos(a) * rad, (r4 - 0.5) * 1.2 + Math.sin(a * 2) * 0.4, Math.sin(a) * rad * 0.45 - 2).add(coreAt);
  }

  function bubbleColor(state, i, t, out) {
    const [r1, r2] = seeds[i];
    if (state === 0) return out.copy(palette.accent).lerp(palette.white, r2 * 0.6);
    if (state === 1) return out.copy(palette.alert).lerp(palette.amber, r2 * 0.4);
    if (state === 2) return out.copy([palette.wa, palette.ig, palette.ms][ringOf(i)]);
    if (state === 3) return out.copy(palette.white).lerp(palette.warm, (r1 + t * 0.06) % 1);
    return out.copy(palette.accent).lerp(palette.warm, r2 * 0.5);
  }

  function bubbleScale(state, i, t) {
    const [r1, r2] = seeds[i];
    if (state === 3) return 0.35 + (1 - ((r1 + t * 0.06) % 1)) * 0.85;
    if (state === 1) return 0.8 + r2 * 0.9;
    return 0.7 + r2 * 0.6;
  }

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const pointer = { x: 0, y: 0 };
  addEventListener('pointermove', (event) => {
    pointer.x = event.clientX / innerWidth - 0.5;
    pointer.y = event.clientY / innerHeight - 0.5;
  });

  let state = scrollState();
  const clock = new THREE.Clock();
  const smooth = (x) => x * x * (3 - 2 * x);

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.25);
    const t = clock.elapsedTime;
    // Suavizado por tiempo (no por cuadro): igual en pantallas de 60 o 120 Hz.
    state += (scrollState() - state) * (1 - Math.exp(-dt * 2.6));
    const k0 = Math.min(4, Math.floor(state));
    const k1 = Math.min(4, k0 + 1);
    const f = state - k0;
    const sA = STATES[k0];
    const sB = STATES[k1];
    const narrow = camera.aspect < 1 ? 0.15 : camera.aspect < 1.4 ? 0.6 : 1;

    corePos.set(...sA.core).lerp(tmpA.set(...sB.core), smooth(f));
    corePos.x *= narrow;
    // En pantallas angostas el núcleo baja, para no quedar detrás del texto.
    if (camera.aspect < 1) corePos.y += THREE.MathUtils.lerp(MOBILE_LIFT[k0], MOBILE_LIFT[k1], smooth(f));
    core.position.copy(corePos);
    shell.position.copy(corePos);
    halo.position.copy(corePos);
    halo.material.color.copy(coreUniforms.uColorA.value).lerp(coreUniforms.uColorB.value, 0.3);
    halo.material.opacity = 0.35 + 0.65 * coreUniforms.uEnergy.value;
    core.rotation.y = t * 0.12;
    shell.rotation.set(t * 0.05, t * 0.08, 0);
    shell.material.opacity = THREE.MathUtils.lerp(sA.shell, sB.shell, f);
    coreUniforms.uTime.value = t;
    coreUniforms.uEnergy.value = THREE.MathUtils.lerp(sA.energy, sB.energy, f);
    coreUniforms.uColorA.value.copy(sA.a).lerp(sB.a, f);
    coreUniforms.uColorB.value.copy(sA.b).lerp(sB.b, f);

    coreFrom.set(...sA.core);
    coreFrom.x *= narrow;
    coreTo.set(...sB.core);
    coreTo.x *= narrow;
    if (camera.aspect < 1) {
      coreFrom.y += MOBILE_LIFT[k0];
      coreTo.y += MOBILE_LIFT[k1];
    }
    for (let i = 0; i < count; i++) {
      // Cada burbuja cambia de estado con un pequeño retraso propio: el
      // enjambre se reacomoda de forma orgánica, no todo a la vez.
      const local = smooth(THREE.MathUtils.clamp((f - seeds[i][0] * 0.35) / 0.65, 0, 1));
      bubblePosition(k0, i, t, tmpA, tmpB.copy(coreFrom));
      bubblePosition(k1, i, t, posTo, tmpB.copy(coreTo));
      dummy.position.lerpVectors(tmpA, posTo, local);
      dummy.rotation.set(0, 0, Math.sin(t * 0.8 + seeds[i][1] * 10) * 0.35);
      dummy.scale.setScalar(THREE.MathUtils.lerp(bubbleScale(k0, i, t), bubbleScale(k1, i, t), local));
      dummy.updateMatrix();
      bubbles.setMatrixAt(i, dummy.matrix);
      bubbleColor(k0, i, t, colA);
      bubbleColor(k1, i, t, colB);
      bubbles.setColorAt(i, colA.lerp(colB, local));
    }
    bubbles.instanceMatrix.needsUpdate = true;
    if (bubbles.instanceColor) bubbles.instanceColor.needsUpdate = true;

    stars.rotation.y = t * 0.008 + state * 0.15;
    stars.position.y = -state * 0.8;
    const camZ = THREE.MathUtils.lerp(sA.cam, sB.cam, smooth(f));
    const ease = 1 - Math.exp(-dt * 3);
    camera.position.x += (pointer.x * 1.2 - camera.position.x) * ease;
    camera.position.y += (-pointer.y * 0.8 - camera.position.y) * ease;
    camera.position.z += (camZ - camera.position.z) * ease;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  if (reduce) {
    frame();
    return;
  }
  let running = true;
  const loop = () => {
    if (!running) return;
    frame();
    requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(loop);
  });
  loop();
}

// Ruido simplex 3D (Ashima Arts / Stefan Gustavson, licencia MIT).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const CORE_VERTEX = /* glsl */ `
uniform float uTime; uniform float uEnergy;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
${NOISE}
void main(){
  float n = snoise(normal * 1.3 + vec3(uTime * 0.22));
  vNoise = n;
  vec3 p = position + normal * n * (0.1 + 0.22 * uEnergy);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = normalize(-mv.xyz);
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const CORE_FRAGMENT = /* glsl */ `
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uEnergy;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
void main(){
  float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.4);
  vec3 base = mix(uColorA, uColorB, smoothstep(-0.5, 0.8, vNoise));
  vec3 color = base * (0.12 + 0.55 * uEnergy) + rim * (base * 1.8 + 0.25) * (0.35 + uEnergy);
  gl_FragColor = vec4(color, 1.0);
}`;

// ── Arranque ─────────────────────────────────────────────────────────
if (gsap && ScrollTrigger && !reduce) {
  document.documentElement.classList.add('anim');
  gsap.registerPlugin(ScrollTrigger);
  setupScroll();
  setupHero();
  setupNight();
  setupReply();
  setupInbox();
  setupFeatures();
  setupPhrase();
  setupClosing();
  scrollState = setupStateAnchors();
}
setupScene(document.getElementById('escena'));
