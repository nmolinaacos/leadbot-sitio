// Leadbot: la historia del inicio contada con el scroll.
// - Lenis suaviza el scroll; GSAP + ScrollTrigger fijan cada acto y animan el DOM.
// - Three.js dibuja un objeto 3D de redes sociales que baja con el scroll
//   (canvas fijo, encima del texto, sin capturar el mouse). Cada acto tiene el
//   suyo (data-estado 0..5): burbuja de chat · campana · robot (el bot) ·
//   corazón · bolsa de compras · sello de confirmado. Entre un acto y otro el
//   objeto se deshace en partículas que cruzan la pantalla por encima del
//   texto, acercándose a la cámara, y se arman en el siguiente al otro lado.
// Con movimiento reducido o sin WebGL la página se ve completa y estática.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

const { gsap, ScrollTrigger, Lenis } = window;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;
const modest = small || (navigator.hardwareConcurrency || 8) <= 4;

let scrollState = () => 0;

// El arranque va al final del archivo.


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
      // Los actos fijados arrancan vacíos y aparecen al bajar: se llega un poco adentro.
      const offset = target.querySelector('.pin') ? innerHeight * 0.45 : 0;
      if (lenis) lenis.scrollTo(target, { offset, duration: 1.6 });
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


// El estado según el scroll: cada acto mantiene su objeto mientras está en
// pantalla, y entre un acto y el siguiente hay casi una pantalla de scroll
// para la transición (el viaje de las partículas).
function setupStateAnchors() {
  let anchors = [];
  const compute = () => {
    const vh = innerHeight;
    anchors = [];
    document.querySelectorAll('[data-estado]').forEach((section) => {
      const value = Number(section.dataset.estado);
      const box = section.getBoundingClientRect();
      const top = box.top + scrollY;
      const start = top - vh * 0.35;
      const end = Math.max(start, top + vh * 0.15, top + box.height - vh * 1.25);
      anchors.push([start, value], [end, value]);
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

// ── Objetos 3D ───────────────────────────────────────────────────────
function glossy(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.26, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, transparent: true, ...extra });
}

// sizeRatio: qué tanto se ensancha el bisel (menos en formas con puntas
// hacia adentro, como el corazón, para que no salgan picos).
function extrude(shape, depth, bevel, sizeRatio = 0.85) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * sizeRatio, bevelSegments: 8, curveSegments: 32 });
  geometry.center();
  return geometry;
}

// Burbuja de chat con los tres puntos de "escribiendo".
function makeBubble() {
  const s = new THREE.Shape();
  s.moveTo(-0.75, -0.95);
  s.lineTo(-1.0, -1.5);
  s.lineTo(-0.2, -0.95);
  s.lineTo(0.75, -0.95);
  s.quadraticCurveTo(1.3, -0.95, 1.3, -0.4);
  s.lineTo(1.3, 0.4);
  s.quadraticCurveTo(1.3, 0.95, 0.75, 0.95);
  s.lineTo(-0.75, 0.95);
  s.quadraticCurveTo(-1.3, 0.95, -1.3, 0.4);
  s.lineTo(-1.3, -0.4);
  s.quadraticCurveTo(-1.3, -0.95, -0.75, -0.95);
  const group = new THREE.Group();
  const body = new THREE.Mesh(extrude(s, 0.45, 0.2), glossy(0x4a78ff));
  group.add(body);
  const dot = glossy(0xffffff, { roughness: 0.2 });
  [-0.55, 0, 0.55].forEach((x) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 16), dot);
    d.position.set(x, 0.18, 0.42);
    group.add(d);
  });
  return { group, primary: body, color: new THREE.Color(0x6f95ff) };
}

// Campana de notificaciones con su globo rojo.
function makeBell() {
  const profile = [[0.001, -0.72], [1.02, -0.72], [1.0, -0.6], [0.78, -0.42], [0.64, -0.1], [0.58, 0.35], [0.48, 0.8], [0.3, 1.08], [0.001, 1.18]].map(([x, y]) => new THREE.Vector2(x, y));
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), glossy(0xffb547));
  group.add(body);
  const knob = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 16, 32), glossy(0xffb547));
  knob.position.y = 1.3;
  group.add(knob);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), glossy(0xffd38a));
  clapper.position.y = -0.86;
  group.add(clapper);
  const badge = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 16), glossy(0xff4d5e));
  badge.position.set(0.72, 0.78, 0.35);
  group.add(badge);
  group.rotation.z = 0.22;
  return { group, primary: body, color: new THREE.Color(0xffb547) };
}

// Cabeza de robot: el bot de Leadbot, que responde.
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function makeRobot() {
  const group = new THREE.Group();
  const head = new THREE.Mesh(extrude(roundedRect(2.3, 1.75, 0.55), 0.8, 0.28), glossy(0xe9eefc));
  group.add(head);
  const screen = new THREE.Mesh(extrude(roundedRect(1.75, 1.15, 0.38), 0.06, 0.05), glossy(0x0d1426, { roughness: 0.15 }));
  screen.position.z = 0.7;
  group.add(screen);
  const eye = glossy(0x6ff0ff, { emissive: 0x2bd8ff, emissiveIntensity: 1.4 });
  [-0.42, 0.42].forEach((x) => {
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 6, 16), eye);
    e.position.set(x, 0.05, 0.8);
    group.add(e);
  });
  const ear = glossy(0x4a78ff);
  [-1.32, 1.32].forEach((x) => {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 32), ear);
    e.rotation.z = Math.PI / 2;
    e.position.set(x, 0, 0);
    group.add(e);
  });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 16), glossy(0xb9c6ea));
  stick.position.set(0, 1.12, 0);
  group.add(stick);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 16), glossy(0xffb547, { emissive: 0xff8a00, emissiveIntensity: 0.4 }));
  ball.position.set(0, 1.4, 0);
  group.add(ball);
  return { group, primary: head, color: new THREE.Color(0xc9d6ff) };
}

// Corazón (me gusta): la curva clásica del corazón, suave en toda su forma.
function makeHeart() {
  const points = [];
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push(new THREE.Vector2(x / 16, y / 16));
  }
  const group = new THREE.Group();
  const body = new THREE.Mesh(extrude(new THREE.Shape(points), 0.45, 0.3, 0.3), glossy(0xff5c8a));
  group.add(body);
  return { group, primary: body, color: new THREE.Color(0xff6f98) };
}

// Bolsa de compras (la venta).
function makeBag() {
  const s = new THREE.Shape();
  const w = 1.0, h = 1.05, r = 0.14;
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w * 0.9, h - r);
  s.quadraticCurveTo(w * 0.9, h, w * 0.9 - r, h);
  s.lineTo(-w * 0.9 + r, h);
  s.quadraticCurveTo(-w * 0.9, h, -w * 0.9, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  const group = new THREE.Group();
  const body = new THREE.Mesh(extrude(s, 0.7, 0.08), glossy(0x8e6bff));
  group.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.075, 16, 48, Math.PI), glossy(0xc9b8ff));
  handle.position.set(0, 1.08, 0);
  group.add(handle);
  return { group, primary: body, color: new THREE.Color(0x9f82ff) };
}

// Sello de "pedido confirmado".
function makeSeal() {
  const s = new THREE.Shape();
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const r = 1.2 + 0.08 * Math.cos(a * 14);
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const group = new THREE.Group();
  const body = new THREE.Mesh(extrude(s, 0.3, 0.12), glossy(0x3fd68f));
  group.add(body);
  const check = new THREE.Shape([[-0.6, 0.02], [-0.42, 0.2], [-0.16, -0.06], [0.44, 0.54], [0.62, 0.36], [-0.16, -0.42]].map(([x, y]) => new THREE.Vector2(x, y)));
  const mark = new THREE.Mesh(extrude(check, 0.12, 0.05), glossy(0xffffff));
  mark.position.set(0, -0.04, 0.3);
  group.add(mark);
  return { group, primary: body, color: new THREE.Color(0x52e3a0) };
}

// Centra el objeto y lo deja de un tamaño parecido a los demás.
function normalize(item) {
  const box = new THREE.Box3().setFromObject(item.group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const holder = new THREE.Group();
  item.group.position.sub(center);
  holder.add(item.group);
  holder.userData.base = 2.5 / Math.max(size.x, size.y, size.z);
  item.holder = holder;
  return item;
}

// ── Escena ───────────────────────────────────────────────────────────
function setupScene(canvas) {
  const aura = document.querySelector('.aura');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return; // Sin WebGL: el texto sigue completo.
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, modest ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  // Neutral conserva la saturación de los colores (ACES los lavaba).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 8);
  const rim = new THREE.DirectionalLight(0x8eaaff, 2.4);
  rim.position.set(-6, -2, -5);
  scene.add(key, rim);

  const items = [makeBubble(), makeBell(), makeRobot(), makeHeart(), makeBag(), makeSeal()].map(normalize);
  items.forEach((item) => {
    item.holder.visible = false;
    item.materials = [];
    item.holder.traverse((o) => o.material && item.materials.push(o.material));
    scene.add(item.holder);
  });
  const LAST = items.length - 1;

  // Dónde descansa cada objeto: a un lado del texto de su acto.
  const DESKTOP = [[3.3, 0.15, 0, 1], [-3.8, -0.2, 0, 0.85], [4.75, 1.55, -0.5, 0.7], [-4.4, -1.0, 0, 0.85], [5.3, 1.9, -0.6, 0.55], [0, -2.2, 0, 0.62]];
  const MOBILE = [[0.7, -2.3, 0, 0.5], [0, -2.35, 0, 0.5], [1.2, 2.55, 0, 0.36], [0, -2.4, 0, 0.5], [1.25, 2.6, 0, 0.34], [0, -2.4, 0, 0.5]];
  const pose = (k) => {
    const wide = camera.aspect >= 1;
    const [x, y, z, s] = (wide ? DESKTOP : MOBILE)[k];
    return { x: x * (wide ? Math.min(1, camera.aspect / 1.8) : 1), y, z, s };
  };

  // Partículas: puntos tomados de la superficie de cada objeto.
  const COUNT = modest ? 900 : 1800;
  const samples = items.map((item) => {
    item.holder.updateMatrixWorld(true);
    const sampler = new MeshSurfaceSampler(item.primary).build();
    const toHolder = new THREE.Matrix4().copy(item.primary.matrixWorld);
    const out = new Float32Array(COUNT * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      sampler.sample(v);
      v.applyMatrix4(toHolder);
      out.set([v.x, v.y, v.z], i * 3);
    }
    return out;
  });
  const jitter = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) jitter.set([Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1], i * 4);
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const particleUniforms = { uAlpha: { value: 0 }, uSize: { value: modest ? 7 : 9 }, uPixelRatio: { value: renderer.getPixelRatio() } };
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.ShaderMaterial({ uniforms: particleUniforms, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, transparent: true, depthWrite: false, vertexColors: true }),
  );
  particles.frustumCulled = false;
  scene.add(particles);

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

  const clock = new THREE.Clock();
  const smooth = (x) => x * x * (3 - 2 * x);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const colorMix = new THREE.Color();
  const screen = new THREE.Vector3();
  let state = scrollState();

  // Coloca un objeto en su lugar de descanso, flotando y siguiendo al mouse.
  function placeAt(k, t) {
    const item = items[k];
    const p = pose(k);
    const h = item.holder;
    h.position.set(p.x, p.y + Math.sin(t * 1.1 + k) * 0.08, p.z);
    h.rotation.set(Math.sin(t * 0.5 + k) * 0.12 - pointer.y * 0.35, Math.sin(t * 0.6 + k * 2) * 0.45 + pointer.x * 0.6, 0);
    h.scale.setScalar(h.userData.base * p.s);
    h.updateMatrixWorld(true);
  }

  function setLook(k, opacity, grow) {
    const h = items[k].holder;
    h.visible = opacity > 0.01;
    h.scale.multiplyScalar(grow);
    h.updateMatrixWorld(true);
    items[k].materials.forEach((m) => {
      m.opacity = opacity;
      m.depthWrite = opacity > 0.98;
    });
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.25);
    const t = clock.elapsedTime;
    state += (scrollState() - state) * (1 - Math.exp(-dt * 4));
    const k = Math.min(LAST, Math.max(0, Math.floor(state + 1e-4)));
    const next = Math.min(LAST, k + 1);
    const p = k === LAST ? 0 : THREE.MathUtils.clamp(state - k, 0, 1);

    items.forEach((item, i) => {
      if (i !== k && i !== next) item.holder.visible = false;
    });
    placeAt(k, t);
    if (p < 0.002) {
      setLook(k, 1, 1);
      if (next !== k) items[next].holder.visible = false;
      particles.visible = false;
    } else {
      placeAt(next, t);
      // Se deshace al empezar, viaja y se arma al final.
      const dissolve = smooth(THREE.MathUtils.clamp(p / 0.16, 0, 1));
      const assemble = smooth(THREE.MathUtils.clamp((p - 0.84) / 0.16, 0, 1));
      const from = samples[k];
      const to = samples[next];
      const mA = items[k].holder.matrixWorld;
      const mB = items[next].holder.matrixWorld;
      const colA = items[k].color;
      const colB = items[next].color;
      for (let i = 0; i < COUNT; i++) {
        const j = i * 4;
        const local = easeInOut(THREE.MathUtils.clamp((p - 0.06 - jitter[j] * 0.22) / 0.7, 0, 1));
        a.fromArray(from, i * 3).applyMatrix4(mA);
        b.fromArray(to, i * 3).applyMatrix4(mB);
        // El punto de control pasa cerca de la cámara: las partículas cruzan
        // por encima del texto, más grandes, antes de llegar al otro lado.
        c.addVectors(a, b).multiplyScalar(0.5);
        c.x += jitter[j + 1] * 1.8;
        c.y += 0.8 + jitter[j + 2] * 1.6;
        c.z += 5 + jitter[j + 3] * 1.4;
        const u = 1 - local;
        positions[i * 3] = u * u * a.x + 2 * u * local * c.x + local * local * b.x;
        positions[i * 3 + 1] = u * u * a.y + 2 * u * local * c.y + local * local * b.y;
        positions[i * 3 + 2] = u * u * a.z + 2 * u * local * c.z + local * local * b.z;
        colorMix.copy(colA).lerp(colB, local);
        colors[i * 3] = colorMix.r;
        colors[i * 3 + 1] = colorMix.g;
        colors[i * 3 + 2] = colorMix.b;
      }
      particleGeometry.attributes.position.needsUpdate = true;
      particleGeometry.attributes.color.needsUpdate = true;
      particles.visible = true;
      particleUniforms.uAlpha.value = Math.min(dissolve, 1 - assemble);
      placeAt(k, t);
      setLook(k, 1 - dissolve, 1 - 0.3 * dissolve);
      placeAt(next, t);
      setLook(next, assemble, 0.7 + 0.3 * assemble);
    }

    // El aura de color detrás del texto sigue al objeto.
    if (aura) {
      const h = items[p > 0.5 ? next : k].holder;
      screen.copy(h.position).project(camera);
      const x = (screen.x * 0.5 + 0.5) * innerWidth;
      const y = (-screen.y * 0.5 + 0.5) * innerHeight;
      colorMix.copy(items[k].color).lerp(items[next].color, p);
      aura.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      aura.style.setProperty('--aura', `rgba(${Math.round(colorMix.r * 255)}, ${Math.round(colorMix.g * 255)}, ${Math.round(colorMix.b * 255)}, 0.22)`);
    }
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

const POINT_VERTEX = /* glsl */ `
uniform float uSize; uniform float uPixelRatio;
varying vec3 vColor;
void main(){
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uPixelRatio * (10.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAGMENT = /* glsl */ `
uniform float uAlpha;
varying vec3 vColor;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float glow = smoothstep(0.5, 0.0, d);
  float core = smoothstep(0.18, 0.0, d);
  gl_FragColor = vec4(vColor * (0.8 + core * 0.8), glow * uAlpha);
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
