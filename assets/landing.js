// Leadbot: la historia del inicio contada con el scroll.
// - Lenis suaviza el scroll; GSAP + ScrollTrigger fijan cada acto y animan el DOM.
// - Three.js dibuja a Leadbot, un robot 3D que acompaña toda la página
//   (canvas fijo, encima del texto, sin capturar el mouse). En cada acto
//   (data-estado 0..6) se ubica a un lado, hace algo (saluda, toma café,
//   escribe en el celular, trabaja en su escritorio…) y le habla al visitante en un
//   globo. Entre actos vuela por encima del texto hasta su nuevo lugar.
// Con movimiento reducido o sin WebGL la página se ve completa y estática.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const { gsap, ScrollTrigger, Lenis } = window;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px)').matches;
const modest = small || (navigator.hardwareConcurrency || 8) <= 4;

let scrollState = () => 0;

// El arranque va al final del archivo.


// ── Scroll suave ─────────────────────────────────────────────────────
let lenis = null;
function setupScroll() {
  lenis = Lenis ? new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 }) : null;
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
}

function scrollToY(y, duration = 1.4) {
  if (lenis) lenis.scrollTo(y, { duration, easing: (t) => 1 - Math.pow(1 - t, 3) });
  else scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
}

// ── Navegación por momentos ──────────────────────────────────────────
// Cada acto tiene uno o varios "momentos": el punto del scroll en que se ve
// completo (en los actos fijados, cuando terminó cada paso de su historia).
// Al dejar de deslizar, la página aterriza en el momento más cercano; los
// puntos del costado y el botón "Sigamos" del robot llevan de uno a otro.
const ACT_NAMES = ['Inicio', 'La noche', 'La respuesta', 'Qué hace', 'Tú decides', 'Planes', 'Hablemos'];

function setupNavigation(pinned) {
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  const top = (selector) => document.querySelector(selector).getBoundingClientRect().top + scrollY;
  const at = (st, f) => st.start + (st.end - st.start) * f;
  let acts = [];
  const compute = () => {
    const frase = document.querySelector('.frase').getBoundingClientRect();
    acts = [
      [0],
      [at(pinned.night, 0.45), at(pinned.night, 0.86)],
      [at(pinned.reply, 0.36), at(pinned.reply, 0.64), at(pinned.reply, 0.9)],
      [top('#funciones') - 24],
      [frase.top + scrollY + frase.height / 2 - innerHeight / 2],
      [top('#planes') - 24],
      [maxScroll()],
    ].map((ys) => ys.map((y) => Math.round(Math.min(Math.max(0, y), maxScroll()))));
  };
  ScrollTrigger.addEventListener('refresh', compute);
  compute();
  const moments = () => acts.flat();
  const goToAct = (i) => scrollToY(acts[i][0]);

  // Aterrizar al dejar de deslizar (solo si hay un momento cerca: dentro de
  // una sección larga, como la lista de funciones en el celular, no se mueve).
  let timer = 0;
  let landing = false;
  const settle = () => {
    if (landing) return;
    const y = scrollY;
    const nearest = moments().reduce((best, m) => (Math.abs(m - y) < Math.abs(best - y) ? m : best), Infinity);
    const distance = Math.abs(nearest - y);
    if (distance < 3 || distance > innerHeight * 0.38) return;
    landing = true;
    scrollToY(nearest, 0.75);
    setTimeout(() => (landing = false), 800);
  };
  addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(settle, 220);
  }, { passive: true });

  // "Sigamos": al siguiente momento después de donde está la página.
  document.addEventListener('leadbot:siguiente', () => {
    const next = moments().find((m) => m > scrollY + 8);
    if (next !== undefined) scrollToY(next);
  });

  // Links del menú: al primer momento de su acto.
  const actOf = { '#inicio': 0, '#noche': 1, '#respuesta': 2, '#funciones': 3, '#planes': 5, '#contacto': 6 };
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const index = actOf[link.getAttribute('href')];
    if (index === undefined) return;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      goToAct(index);
    });
  });

  // Puntos de avance al costado (abajo del menú en el celular).
  const dots = document.querySelector('.progreso');
  if (dots) {
    dots.innerHTML = ACT_NAMES.map((name, i) => `<button type="button" data-acto="${i}" aria-label="Ir a: ${name}"><span>${name}</span></button>`).join('');
    dots.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button) goToAct(Number(button.dataset.acto));
    });
  }

  // El acto activo (puntos) y, en el celular, WhatsApp en el menú al salir del inicio.
  const cta = document.querySelector('.nav-cta');
  const whatsapp = 'https://wa.me/573233272083?text=Hola%2C%20quiero%20conocer%20Leadbot';
  let active = -1;
  let green = null;
  // El acto activo es la última sección cuyo comienzo ya pasó la mitad de la pantalla.
  const sections = ['#inicio', '#noche', '#respuesta', '#funciones', '.frase', '#planes', '#contacto'].map((sel) => document.querySelector(sel));
  const update = () => {
    let current = 0;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= innerHeight * 0.5) current = i;
    });
    if (current !== active && dots) {
      active = current;
      dots.querySelectorAll('button').forEach((b, i) => b.toggleAttribute('aria-current', i === active));
    }
    const wantGreen = innerWidth < 760 && scrollY > innerHeight * 0.6;
    if (cta && wantGreen !== green) {
      green = wantGreen;
      cta.classList.toggle('nav-whatsapp', green);
      cta.textContent = green ? 'WhatsApp' : 'Hablemos';
      cta.setAttribute('href', green ? whatsapp : '#contacto');
      if (green) cta.setAttribute('target', '_blank');
      else cta.removeAttribute('target');
    }
  };
  addEventListener('scroll', update, { passive: true });
  ScrollTrigger.addEventListener('refresh', update);
  update();
  // El link de WhatsApp no debe pasar por el scroll suave.
  cta?.addEventListener('click', (event) => {
    if (cta.classList.contains('nav-whatsapp')) event.stopImmediatePropagation();
  }, true);
}

// Envuelve cada palabra en un span (las <em> quedan enteras, como una sola pieza).
function splitWords(element) {
  const pieces = [];
  [...element.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const fragment = document.createDocumentFragment();
      // Solo espacios normales: el espacio duro (&nbsp;) une palabras que no
      // deben separarse ("a toda") y queda dentro de la misma pieza.
      node.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
        if (!part) return;
        if (/^[ \t\n\r]+$/.test(part)) fragment.append(part);
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
  // Las conversaciones llegan volando desde el fondo y quedan en abanico
  // (en el celular, en cascada: una debajo de otra, corridas).
  const mobile = innerWidth < 760;
  // Cuánto se abre el abanico: lo que permita la columna, para que las tres
  // quepan en su mitad sin montarse sobre el texto ni salirse de la pantalla.
  const stack = document.querySelector('.hero-tarjetas');
  const column = stack.clientWidth;
  const card = stack.querySelector('.tarjeta').offsetWidth;
  const spread = Math.round(Math.min(58, Math.max(26, ((column - card) / 2 / card) * 100 * 0.92)));
  // En escalera: cada tarjeta baja media tarjeta y queda encima de la anterior,
  // así se lee la red social de las tres. La caja crece para contenerlas.
  const step = Math.round(Math.max(...[...stack.querySelectorAll('.tarjeta')].map((c) => c.offsetHeight)) / 2);
  if (!mobile) stack.style.height = `${step * 4 + 24}px`;
  const fan = mobile
    ? { '.t-wa': { xPercent: 6, y: 0, rotateZ: 1.5, rotateY: 0, z: 0 }, '.t-ig': { xPercent: 0, y: 44, rotateZ: -1, rotateY: 0, z: 0 }, '.t-ms': { xPercent: -6, y: 88, rotateZ: -1.5, rotateY: 0, z: 0 } }
    : { '.t-wa': { xPercent: -spread, y: 0, rotateZ: -4, rotateY: 10, z: 0 }, '.t-ig': { xPercent: 0, y: step, rotateZ: 0, rotateY: 0, z: 0 }, '.t-ms': { xPercent: spread, y: step * 2, rotateZ: 4, rotateY: -10, z: 0 } };
  Object.entries(fan).forEach(([selector, end], i) => {
    tl.fromTo(`.hero-tarjetas ${selector}`, { opacity: 0, z: -700, xPercent: end.xPercent * 2.4, y: end.y + 80, rotateY: end.rotateY * 4, rotateX: -40 },
      { opacity: 1, ...end, rotateX: 0, duration: 1.4, ease: 'expo.out' }, 0.55 + i * 0.12);
  });
  // El abanico se inclina un poco siguiendo el mouse.
  if (matchMedia('(hover: hover)').matches) {
    const cards = document.querySelector('.hero-tarjetas');
    addEventListener('pointermove', (event) => {
      gsap.to(cards, { rotateY: (event.clientX / innerWidth - 0.5) * 6, rotateX: -(event.clientY / innerHeight - 0.5) * 5, duration: 0.8, ease: 'power2.out' });
    });
  }
  gsap.to(['.hero-contenido', '.hero-tarjetas'], {
    yPercent: -20, opacity: 0, scale: 0.97, ease: 'none',
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
  return tl.scrollTrigger;
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

  // El teléfono entra de espaldas y da una vuelta completa antes de que lleguen los mensajes.
  tl.fromTo('.telefono-escena', { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0)
    .fromTo('.telefono', { rotateY: -340, rotateX: 14, rotateZ: -6, y: 70, scale: 0.86 }, { rotateY: -8, rotateX: 4, rotateZ: 0, y: 0, scale: 1, duration: 0.17, ease: 'power3.inOut' }, 0)
    .fromTo('.pasos', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.1 }, 0.02);
  focus(0, 0.05);
  show(0, 0.19); // cliente pregunta
  show(1, 0.25); // escribiendo…
  hide(1, 0.31);
  show(2, 0.32); // el bot responde
  focus(1, 0.41);
  show(3, 0.45); // foto
  show(4, 0.52); // precio
  show(5, 0.59); // catálogo PDF
  focus(2, 0.68);
  show(6, 0.72); // "me la llevo"
  show(7, 0.8); // resumen del pedido
  tl.to('.telefono', { rotateY: 6, rotateX: 0, duration: 0.76, ease: 'none' }, 0.18)
    .to('.respuesta .pin', { opacity: 0, y: -40, duration: 0.08 }, 0.94);
  return tl.scrollTrigger;
}

// ── Planes: mensual o anual, y las tarjetas entran como las funciones ──
function setupPlans() {
  const toggle = document.querySelector('.periodo');
  if (toggle) {
    toggle.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const period = button.dataset.periodo;
      toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      document.querySelectorAll('.planes [data-mensual]').forEach((el) => (el.textContent = el.dataset[period]));
    });
  }
  ScrollTrigger.batch('.plan', {
    start: 'top 90%',
    onEnter: (batch) => gsap.fromTo(batch, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.1 }),
  });
}

// ── Acto 3: qué hace (aparecen y se inclinan con el mouse) ───────────
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

// ── Acto 4: la frase se ilumina palabra por palabra ──────────────────
function setupPhrase() {
  const words = splitWords(document.querySelector('[data-resaltar]'));
  gsap.fromTo(words, { opacity: 0.14 }, {
    opacity: 1, stagger: 0.05, ease: 'none',
    scrollTrigger: { trigger: '.frase', start: 'top 70%', end: 'bottom 60%', scrub: true },
  });
}

// ── Acto 5: cierre ───────────────────────────────────────────────────
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

// ── Piezas del robot ─────────────────────────────────────────────────
function glossy(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.26, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, ...extra });
}

function extrude(shape, depth, bevel) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: 8, curveSegments: 32 });
  geometry.center();
  return geometry;
}

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

// Globo de chat (los mensajes que le llegan al robot).
function bubbleGeometry() {
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
  return extrude(s, 0.45, 0.2);
}

// Leadbot: carcasa blanca perlada, visor de vidrio con ojos de luz, orejas
// con lente, articulaciones cromadas, manos mecánicas y botas; un anillo lo
// hace flotar y una taza de café aparece de noche.
function makeRobot() {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const seg = modest ? 40 : 64;

  // Materiales: el cromo y el metal azul necesitan más reflejo del entorno.
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xf3f5fa, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.4, sheenColor: 0xdfe8ff });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xe4e9f2, metalness: 1, roughness: 0.14, envMapIntensity: 2.2 });
  const blueMetal = new THREE.MeshPhysicalMaterial({ color: 0x3f6dff, metalness: 0.75, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.6 });
  const gunmetal = new THREE.MeshPhysicalMaterial({ color: 0x2b303c, metalness: 0.7, roughness: 0.32, envMapIntensity: 1.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x181b23, roughness: 0.75 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x04060c, roughness: 0.04, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8 });
  const add = (parent, geometry, material, [x = 0, y = 0, z = 0] = [], rot) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  };
  // Un trozo de esfera (para que el visor siga la curva de la cabeza).
  const cap = (r, w, h) => new THREE.SphereGeometry(r, seg, seg / 2, Math.PI / 2 - w / 2, w, Math.PI / 2 - h / 2, h);

  // ── Cabeza: un huevo ancho con el visor curvo al frente.
  const head = new THREE.Group();
  head.position.y = 1.15;
  rig.add(head);
  const shell = new THREE.Group();
  shell.scale.set(1.2, 0.95, 1);
  head.add(shell);
  add(shell, new THREE.SphereGeometry(1, seg, seg), pearl);
  add(shell, cap(1.006, 1.72, 1.06), blueMetal); // marco azul del visor
  add(shell, cap(1.014, 1.6, 0.94), glass);
  // Línea de la carcasa sobre la frente.
  add(shell, new THREE.TorusGeometry(1.0, 0.012, 8, seg * 2, Math.PI * 0.62), gunmetal, [0, 0, 0], [0, Math.PI / 2, Math.PI * 0.19]);

  const eyeMaterial = glossy(0x7ff4ff, { emissive: 0x2bd8ff, emissiveIntensity: 1.6 });
  const eyes = [-0.4, 0.4].map((x) => {
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.2, 8, 20), eyeMaterial);
    e.scale.z = 0.45;
    e.position.set(x, 0.04, 0.98);
    e.rotation.y = x * 0.35;
    e.userData.home = e.position.clone();
    head.add(e);
    return e;
  });

  // Orejas: aro azul, goma y lente de cámara cromada.
  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.x = side * 1.13;
    ear.rotation.z = (side * Math.PI) / 2;
    head.add(ear);
    add(ear, new THREE.CylinderGeometry(0.44, 0.44, 0.16, seg), blueMetal);
    // Girada 90°, la -y local de la oreja apunta hacia afuera de la cabeza.
    add(ear, new THREE.CylinderGeometry(0.36, 0.38, 0.24, seg), rubber);
    add(ear, new THREE.CylinderGeometry(0.27, 0.3, 0.3, seg), chrome);
    add(ear, new THREE.TorusGeometry(0.2, 0.025, 12, seg), gunmetal, [0, -0.155, 0], [Math.PI / 2, 0, 0]);
    const lens = add(ear, new THREE.SphereGeometry(0.17, seg, seg / 2), glass, [0, -0.15, 0]);
    lens.scale.y = 0.45;
  });

  // Antena: base cromada, varilla y la bola naranja que brilla.
  add(head, new THREE.CylinderGeometry(0.16, 0.2, 0.08, seg), chrome, [0, 0.93, 0]);
  add(head, new THREE.CylinderGeometry(0.035, 0.045, 0.42, 16), chrome, [0, 1.15, 0]);
  const ballMaterial = glossy(0xffb547, { emissive: 0xff8a00, emissiveIntensity: 0.4 });
  add(head, new THREE.SphereGeometry(0.15, 32, 16), ballMaterial, [0, 1.42, 0]);

  // ── Cuello con fuelle de goma.
  add(rig, new THREE.CylinderGeometry(0.2, 0.24, 0.32, seg), chrome, [0, 0.08, 0]);
  [0.0, 0.1, 0.2].forEach((y) => add(rig, new THREE.TorusGeometry(0.22, 0.04, 12, seg), rubber, [0, y - 0.02, 0], [Math.PI / 2, 0, 0]));

  // ── Cuerpo: un huevo con cinturón, rejillas y el globo de chat en el pecho.
  // Torso torneado: ancho en el pecho y más angosto hacia la cadera.
  const perfil = new THREE.SplineCurve([
    [0, 0.06], [0.5, 0.02], [0.76, -0.2], [0.82, -0.5], [0.74, -0.86], [0.58, -1.12], [0.34, -1.3], [0, -1.34],
  ].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(48).reverse(); // de abajo hacia arriba: caras hacia afuera
  const torso = add(rig, new THREE.LatheGeometry(perfil, seg), pearl, [0, -0.08, 0]);
  torso.scale.z = 0.86;
  const belt = add(rig, new THREE.TorusGeometry(0.71, 0.065, 16, seg * 2), gunmetal, [0, -1.0, 0], [Math.PI / 2, 0, 0]);
  belt.scale.set(1, 0.86, 1);
  // Cadera oscura que une el cuerpo con las piernas.
  const hip = add(rig, new THREE.SphereGeometry(1, seg, seg / 2), gunmetal, [0, -1.42, 0]);
  hip.scale.set(0.4, 0.13, 0.34);
  const chestMaterial = glossy(0x4a78ff, { emissive: 0x2f6bff, emissiveIntensity: 0.6 });
  const emblem = add(rig, bubbleGeometry(), chestMaterial, [0, -0.6, 0.72]);
  emblem.scale.setScalar(0.105);
  [-1, 1].forEach((side) => {
    add(rig, new THREE.CapsuleGeometry(0.03, 0.12, 6, 12), rubber, [side * 0.34, -0.32, 0.62], [0.35, 0, side * 1.1]);
    add(rig, new THREE.SphereGeometry(0.035, 16, 8), blueMetal, [side * 0.56, -0.92, 0.4]);
  });

  // ── Brazos: hombro cromado, codo, puño azul y mano de tres dedos.
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.86, -0.34, 0);
    add(pivot, new THREE.SphereGeometry(0.21, seg, seg / 2), gunmetal, [-side * 0.06, 0, 0]); // cavidad del hombro
    add(pivot, new THREE.SphereGeometry(0.17, seg, seg / 2), chrome);
    add(pivot, new THREE.CapsuleGeometry(0.155, 0.22, 8, 20), pearl, [0, -0.31, 0]);
    add(pivot, new THREE.TorusGeometry(0.15, 0.045, 12, seg), rubber, [0, -0.49, 0], [Math.PI / 2, 0, 0]);
    add(pivot, new THREE.SphereGeometry(0.125, seg, seg / 2), chrome, [0, -0.57, 0]);
    add(pivot, new THREE.CapsuleGeometry(0.17, 0.2, 8, 20), pearl, [0, -0.79, 0]);
    add(pivot, new THREE.CylinderGeometry(0.185, 0.185, 0.1, seg), blueMetal, [0, -0.93, 0]);
    add(pivot, new THREE.CylinderGeometry(0.07, 0.08, 0.1, 20), chrome, [0, -1.0, 0]);
    const palm = add(pivot, new THREE.SphereGeometry(0.12, seg, seg / 2), chrome, [0, -1.1, 0]);
    palm.scale.set(1, 0.8, 0.75);
    [-0.065, 0, 0.065].forEach((x, i) => {
      add(pivot, new THREE.CapsuleGeometry(0.032, 0.1, 6, 12), chrome, [x, -1.24, 0.02], [0.25, 0, (i - 1) * 0.15]);
      add(pivot, new THREE.SphereGeometry(0.036, 12, 8), gunmetal, [x * 1.1, -1.18, 0.02]);
    });
    add(pivot, new THREE.CapsuleGeometry(0.032, 0.08, 6, 12), chrome, [-side * 0.11, -1.14, 0.07], [0.5, 0, -side * 0.9]);
    rig.add(pivot);
    return pivot;
  });

  // ── Piernas cortas cromadas y botas azules con suela de goma.
  [-1, 1].forEach((side) => {
    add(rig, new THREE.CylinderGeometry(0.1, 0.11, 0.3, 24), chrome, [side * 0.34, -1.6, 0]);
    add(rig, new THREE.TorusGeometry(0.11, 0.035, 12, 24), rubber, [side * 0.34, -1.6, 0], [Math.PI / 2, 0, 0]);
    const boot = add(rig, new THREE.SphereGeometry(1, seg, seg / 2), blueMetal, [side * 0.38, -1.84, 0.08]);
    boot.scale.set(0.3, 0.17, 0.4);
    const sole = add(rig, new THREE.CylinderGeometry(1, 1, 1, seg), rubber, [side * 0.38, -1.95, 0.08]);
    sole.scale.set(0.3, 0.05, 0.4);
    const top = add(rig, new THREE.SphereGeometry(1, seg, seg / 2), pearl, [side * 0.38, -1.76, 0.02]);
    top.scale.set(0.19, 0.1, 0.22);
  });

  // Taza de café en la mano izquierda (la noche: no duerme).
  const mug = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.36, 32), glossy(0xffb547));
  mug.add(cup);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 12, 24), glossy(0xffb547));
  handle.position.x = 0.22;
  mug.add(handle);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 32), glossy(0x4a2a12, { roughness: 0.4 }));
  coffee.position.y = 0.17;
  mug.add(coffee);
  mug.position.set(0, -1.22, 0.16);
  mug.scale.setScalar(0.001);
  arms[0].add(mug);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 16, 72), new THREE.MeshBasicMaterial({ color: 0x6ff0ff, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -2.12;
  rig.add(ring);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  rig.position.y = -(box.min.y + box.max.y) / 2;
  root.userData.base = 2.7 / (box.max.y - box.min.y);
  return { root, rig, head, eyes, ballMaterial, chestMaterial, arms, mug, ring };
}

// Pantalla dibujada en un canvas (el chat del celular, la gráfica de la tablet).
function screenTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const FONT = 'Figtree, "Helvetica Neue", Arial, sans-serif';

function drawChat(g, w, h) {
  g.fillStyle = '#0b1020';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#121a2e';
  g.fillRect(0, 0, w, 70);
  g.fillStyle = '#4a78ff';
  g.beginPath();
  g.arc(36, 36, 18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `700 13px ${FONT}`;
  g.fillText('TJ', 27, 41);
  g.font = `700 19px ${FONT}`;
  g.fillText('Todo Juegos', 64, 33);
  g.fillStyle = '#3fd68f';
  g.font = `500 14px ${FONT}`;
  g.fillText('en línea', 64, 54);
  const bubble = (x, y, bw, bh, color, lines, text = '#fff') => {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x, y, bw, bh, 14);
    g.fill();
    g.fillStyle = text;
    g.font = `500 17px ${FONT}`;
    lines.forEach((line, i) => g.fillText(line, x + 14, y + 27 + i * 22));
  };
  bubble(14, 88, 190, 56, '#1d2539', ['¿Tienen la silla', 'Nova en negro?']);
  bubble(70, 156, 172, 36, '#4a78ff', ['¡Sí! Mírala 👇']);
  g.fillStyle = '#f3f5fa';
  g.beginPath();
  g.roundRect(100, 202, 142, 112, 14);
  g.fill();
  g.fillStyle = '#1d2230';
  g.beginPath();
  g.roundRect(155, 216, 32, 46, 8);
  g.roundRect(144, 258, 54, 11, 4);
  g.fill();
  g.fillRect(168, 268, 6, 22);
  g.fillRect(150, 290, 42, 5);
  bubble(56, 326, 186, 36, '#4a78ff', ['$650.000 · envío gratis']);
  bubble(14, 374, 140, 36, '#1d2539', ['¡Me la llevo!']);
  bubble(86, 424, 156, 36, '#3fd68f', ['Pedido #1042 ✓'], '#0b1020');
}

function drawChart(g, w, h) {
  g.fillStyle = '#0b1020';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.font = `700 26px ${FONT}`;
  g.fillText('Ventas por anuncio', 28, 48);
  g.fillStyle = '#3fd68f';
  g.font = `700 40px ${FONT}`;
  g.fillText('+38 %', w - 150, 54);
  const bars = [0.3, 0.42, 0.38, 0.6, 0.72, 0.92];
  const base = h - 40;
  const barW = 52;
  bars.forEach((v, i) => {
    const x = 34 + i * 76;
    const bh = v * (h - 130);
    const grad = g.createLinearGradient(0, base - bh, 0, base);
    grad.addColorStop(0, i === bars.length - 1 ? '#3fd68f' : '#8eaaff');
    grad.addColorStop(1, '#2a4fd0');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(x, base - bh, barW, bh, 8);
    g.fill();
  });
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(24, base + 2);
  g.lineTo(w - 24, base + 2);
  g.stroke();
}

// Lo que el robot usa en cada acto: celular, escritorio con laptop y
// lámpara, tablet, campana y caja de regalo. Viven en el cuerpo (rig) y se
// acomodan en sus manos cada cuadro.
function makeProps(robot) {
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xe4e9f2, metalness: 1, roughness: 0.14, envMapIntensity: 2.2 });
  const gunmetal = new THREE.MeshPhysicalMaterial({ color: 0x2b303c, metalness: 0.7, roughness: 0.3, envMapIntensity: 1.4 });
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x3f6dff, metalness: 0.5, roughness: 0.25, clearcoat: 1, envMapIntensity: 1.4 });
  const orange = glossy(0xffb547);
  const wood = new THREE.MeshPhysicalMaterial({ color: 0x8a5a3c, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const glow = glossy(0x4a78ff, { emissive: 0x2f6bff, emissiveIntensity: 1.1 });
  const screen = (texture) => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const add = (parent, geometry, material, [x = 0, y = 0, z = 0] = [], rot) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  };
  const slab = (w, h, r, d) => extrude(roundedRect(w, h, r), d, Math.min(0.02, d / 3));
  const hidden = (group) => {
    group.scale.setScalar(0.001);
    robot.rig.add(group);
    return group;
  };

  // Celular: marco oscuro y la conversación de una venta en la pantalla.
  const phone = hidden(new THREE.Group());
  add(phone, slab(0.62, 1.24, 0.1, 0.05), gunmetal);
  add(phone, new THREE.PlaneGeometry(0.56, 1.12), screen(screenTexture(256, 512, drawChat)), [0, 0, 0.051]);

  // Tablet con la gráfica de ventas por anuncio.
  const tablet = hidden(new THREE.Group());
  add(tablet, slab(1.5, 1.06, 0.1, 0.05), gunmetal);
  add(tablet, new THREE.PlaneGeometry(1.4, 0.96), screen(screenTexture(512, 352, drawChart)), [0, 0, 0.051]);

  // Campana de mano: el robot te avisa cuando alguien pide una persona.
  const bell = hidden(new THREE.Group());
  const ring = new THREE.Group(); // el pivote está en el mango
  bell.add(ring);
  add(ring, new THREE.CylinderGeometry(0.06, 0.07, 0.36, 20), blue, [0, -0.18, 0]);
  add(ring, new THREE.SphereGeometry(0.08, 20, 12), chrome, [0, 0, 0]);
  const dome = add(ring, new THREE.LatheGeometry([[0, -0.78], [0.36, -0.78], [0.33, -0.7], [0.26, -0.56], [0.2, -0.44], [0.12, -0.38], [0, -0.36]].map(([x, y]) => new THREE.Vector2(x, y)), 48),
    new THREE.MeshPhysicalMaterial({ color: 0xffc861, metalness: 1, roughness: 0.18, envMapIntensity: 2 }));
  dome.material.side = THREE.DoubleSide;
  add(ring, new THREE.SphereGeometry(0.07, 16, 10), gunmetal, [0, -0.76, 0]);

  // Caja de regalo: los 14 días de prueba.
  const gift = hidden(new THREE.Group());
  add(gift, new THREE.BoxGeometry(0.8, 0.62, 0.62), blue);
  add(gift, new THREE.BoxGeometry(0.84, 0.66, 0.12), orange);
  add(gift, new THREE.BoxGeometry(0.12, 0.66, 0.66), orange);
  add(gift, new THREE.TorusGeometry(0.11, 0.035, 12, 24), orange, [-0.1, 0.38, 0], [0, 0, 0.7]);
  add(gift, new THREE.TorusGeometry(0.11, 0.035, 12, 24), orange, [0.1, 0.38, 0], [0, 0, -0.7]);

  // Escritorio de noche: tablero de madera, patas cromadas, laptop con el
  // logo encendido y una lámpara.
  const desk = hidden(new THREE.Group());
  desk.position.set(0, -0.98, 1.25);
  add(desk, new THREE.BoxGeometry(3.0, 0.1, 1.3), wood);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(desk, new THREE.CylinderGeometry(0.045, 0.045, 1.1, 16), chrome, [sx * 1.38, -0.6, sz * 0.55])));
  add(desk, new THREE.BoxGeometry(1.1, 0.04, 0.72), gunmetal, [0.15, 0.07, -0.08]);
  const lid = new THREE.Group();
  lid.position.set(0.15, 0.09, 0.28);
  lid.rotation.x = 0.22;
  desk.add(lid);
  add(lid, new THREE.BoxGeometry(1.1, 0.74, 0.035), gunmetal, [0, 0.37, 0]);
  const logo = add(lid, bubbleGeometry(), glow, [0, 0.38, 0.03]);
  logo.scale.setScalar(0.09);
  const lamp = new THREE.Group();
  // Al otro lado de la taza; reflejada para que la luz apunte a la laptop.
  lamp.position.set(1.22, 0.05, 0.3);
  lamp.scale.x = -1;
  desk.add(lamp);
  add(lamp, new THREE.CylinderGeometry(0.16, 0.18, 0.04, 32), chrome);
  add(lamp, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 12), chrome, [0.08, 0.34, 0], [0, 0, -0.25]);
  add(lamp, new THREE.CylinderGeometry(0.025, 0.025, 0.45, 12), chrome, [0.3, 0.75, 0], [0, 0, -1.2]);
  add(lamp, new THREE.ConeGeometry(0.17, 0.24, 24, 1, true), gunmetal, [0.5, 0.78, 0], [0, 0, 2.6]).material.side = THREE.DoubleSide;
  add(lamp, new THREE.SphereGeometry(0.07, 16, 10), glossy(0xfff1c9, { emissive: 0xffd27a, emissiveIntensity: 2 }), [0.53, 0.72, 0]);

  // Puntos de agarre en cada mano (en el sistema del brazo).
  const hands = robot.arms.map((arm) => {
    const anchor = new THREE.Object3D();
    anchor.position.set(0, -1.16, 0.04);
    arm.add(anchor);
    return anchor;
  });
  const handPos = [new THREE.Vector3(), new THREE.Vector3()];
  const mid = new THREE.Vector3();
  const place = (prop, at, weight, [ox, oy, oz], [rx, ry, rz] = [0, 0, 0]) => {
    prop.position.copy(at).add(mid.set(ox, oy, oz));
    prop.rotation.set(rx, ry, rz);
    prop.scale.setScalar(Math.max(0.001, weight));
  };

  // w[i]: cuánto está en pantalla el acto i (0..1).
  return function update(w, t) {
    hands.forEach((anchor, i) => {
      anchor.getWorldPosition(handPos[i]);
      robot.rig.worldToLocal(handPos[i]);
    });
    const center = new THREE.Vector3().addVectors(handPos[0], handPos[1]).multiplyScalar(0.5);
    // Celular: en una mano en el inicio, entre las dos al responder.
    const phoneW = Math.max(w[0], w[2]);
    const share = phoneW ? w[2] / (w[0] + w[2]) : 0;
    const phoneAt = new THREE.Vector3().lerpVectors(handPos[1], center, share);
    place(phone, phoneAt, phoneW, [share * 0, 0.42, 0.12], [-0.2, -0.15 * (1 - share), 0.08 * (1 - share)]);
    place(tablet, center, w[3], [0, 0.3, 0.14], [-0.18, 0, 0]);
    place(bell, handPos[1], w[4], [0, 0.02, 0.02]);
    ring.rotation.z = Math.sin(t * 14) * 0.35 * w[4];
    place(gift, center, w[5], [0, 0.2, 0.22], [0, 0.25, 0]);
    desk.scale.setScalar(Math.max(0.001, w[1]));
  };
}

// ── Escena ───────────────────────────────────────────────────────────
// Lo que dice el robot en cada acto (mismo orden que data-estado).
const MESSAGES = [
  '¡Hola! Soy Leadbot 👋 Respondo tus chats de WhatsApp, Instagram y Messenger, y tú lo ves todo en un solo tablero.',
  'Son las 11:47 p. m. Tú descansas… yo sigo despierto. ☕',
  'Laura quiere la Nova en negro. Ya le mandé la foto, el precio y el catálogo. ⚡',
  'También recupero carritos, aviso cuando llega lo agotado y te cuento qué anuncio vende.',
  'Y si alguien pide hablar con una persona, te aviso al instante. 🙋',
  'Pruébame 14 días gratis, sin tarjeta. Si te gusto, eliges tu plan. 😉',
  '¿Me pones a vender esta noche? Escríbenos 👇',
];

// Dónde está el robot en cada acto: [x, y, z, escala, lado del globo,
// ancla]. Con ancla (un selector), el robot se ubica justo debajo de ese
// elemento y se mueve con la página (el cierre: no cae sobre el pie).
const DESKTOP = [
  [4.35, -1.75, 0.2, 0.5, 'izquierda', '.hero-tarjetas'],
  [-4.5, -1.0, 0, 0.8, 'arriba'],
  [4.6, 1.05, -0.3, 0.62, 'abajo'],
  [5.0, 1.45, -0.5, 0.55, 'abajo'],
  [-4.8, 0.5, -0.3, 0.6, 'abajo'],
  [5.0, 1.45, -0.5, 0.55, 'abajo'],
  [0, -2.05, 0, 0.56, 'derecha', '.cierre .acciones'],
];
const MOBILE = [
  [0.95, -2.2, 0, 0.42, 'izquierda'],
  [0.95, -2.25, 0, 0.42, 'izquierda'],
  [1.1, 2.4, 0, 0.32, 'izquierda'],
  [1.15, 2.5, 0, 0.3, 'izquierda'],
  [1.05, -2.25, 0, 0.4, 'izquierda'],
  [1.05, -2.25, 0, 0.4, 'izquierda'],
  [0.9, -2.3, 0, 0.42, 'izquierda', '.cierre .acciones'],
];

function setupScene(canvas) {
  const aura = document.querySelector('.aura');
  const dialog = document.querySelector('.dialogo');
  const dialogText = dialog?.querySelector('.dialogo-texto');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return; // Sin WebGL: el texto sigue completo.
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, modest ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  // Neutral conserva la saturación de los colores.
  renderer.toneMapping = THREE.NeutralToneMapping;

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

  const robot = makeRobot();
  scene.add(robot.root);
  const LAST = MESSAGES.length - 1;

  // Chats que le llegan al robot (de noche y al responder) o con los que
  // hace malabares (en el inicio): verde, rosado y azul, como los canales.
  // Lo que usa en cada acto (celular, escritorio, tablet, campana, regalo).
  const updateProps = makeProps(robot);
  let lastPing = 0;

  // Estela de luz cuando vuela.
  const TRAIL = 160;
  const trailPositions = new Float32Array(TRAIL * 3);
  const trailAlpha = new Float32Array(TRAIL);
  const trailVelocity = new Float32Array(TRAIL * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const trailUniforms = { uSize: { value: modest ? 7 : 9 }, uPixelRatio: { value: renderer.getPixelRatio() } };
  const trail = new THREE.Points(trailGeometry, new THREE.ShaderMaterial({ uniforms: trailUniforms, vertexShader: TRAIL_VERTEX, fragmentShader: TRAIL_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  trail.frustumCulled = false;
  scene.add(trail);
  let trailNext = 0;

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

  // Mitad del alto visible en el plano z = 0 (la cámara está en z = 10).
  const halfHeight = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  // De píxeles de la pantalla al plano z = 0.
  const toWorld = (px, py) => {
    const h = halfHeight();
    return { x: ((2 * px) / innerWidth - 1) * h * camera.aspect, y: (1 - (2 * py) / innerHeight) * h };
  };
  // En el celular no hay espacio a los lados: el robot vive abajo a la
  // derecha, como un chat, y cada acto deja ese espacio libre (ver CSS
  // .pin y .hero). Mide ~125 px de alto.
  const DOCK_PX = 125;
  const dockScale = () => (DOCK_PX * 2 * halfHeight()) / (2.7 * innerHeight);
  const pose = (k) => {
    const wide = camera.aspect >= 1;
    const [x, y, z, s, side, anchor] = (wide ? DESKTOP : MOBILE)[k];
    const placed = { x: x * (wide ? Math.min(1, camera.aspect / 1.8) : 1), y, z, s, side };
    if (!wide) {
      const dock = toWorld(innerWidth - 58, innerHeight - DOCK_PX / 2 - 22);
      Object.assign(placed, { x: dock.x, y: dock.y, z: 0, s: dockScale(), side: 'izquierda' });
    }
    const element = anchor && document.querySelector(anchor);
    if (element) {
      // Debajo del elemento: el alto del robot en pantalla es ~2,7 × escala.
      const box = element.getBoundingClientRect();
      const h = halfHeight();
      const robotPx = ((2.7 * s) / (2 * h)) * innerHeight;
      let py = box.bottom + 24 + robotPx / 2;
      // Nunca por debajo del borde de arriba del pie ni de la pantalla (pantallas bajitas).
      const footer = document.querySelector('.pie');
      if (footer) py = Math.min(py, footer.getBoundingClientRect().top - 12 - robotPx / 2);
      py = Math.min(py, innerHeight - 12 - robotPx / 2);
      placed.y = (1 - (2 * py) / innerHeight) * h;
      if (!wide) placed.x = ((2 * (box.left + box.width * 0.78)) / innerWidth - 1) * h * camera.aspect;
    }
    return placed;
  };

  // Lo que hacen los brazos en cada acto: [izquierdo x, izquierdo z, derecho x, derecho z].
  // x negativo lleva la mano hacia adelante; z negativo abre el brazo
  // izquierdo hacia afuera y z positivo, el derecho.
  function armTargets(k, t) {
    const idle = [Math.sin(t * 1.4) * 0.08, -0.18, Math.sin(t * 1.4 + 1) * 0.08, 0.18];
    const tap = Math.sin(t * 14) * 0.08;
    if (k === LAST) return [idle[0], idle[1], -0.2, 2.5 + Math.sin(t * 7) * 0.4]; // se despide
    if (k === 0) return [-0.2, -2.4 + Math.sin(t * 7) * 0.35, -1.25, -0.15]; // saluda y muestra el celular
    if (k === 1) return [-1.45 + Math.max(0, Math.sin(t * 0.9)) * -0.45, 0.35, -1.0 + Math.sin(t * 16) * 0.12, -0.15]; // café y escribe en la laptop
    if (k === 2) return [-1.3 + tap, 0.38, -1.3, -0.38]; // escribe en el celular con las dos manos
    if (k === 3) return [-1.0, 0.5, -1.0, -0.5]; // muestra la tablet
    if (k === 4) return [idle[0], idle[1], -0.3, 2.2 + Math.sin(t * 12) * 0.1]; // levanta y toca la campana
    if (k === 5) return [-0.7, 0.55, -0.7, -0.55]; // sostiene el regalo
    return idle;
  }

  const clock = new THREE.Clock();
  const smooth = (x) => x * x * (3 - 2 * x);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const headWorld = new THREE.Vector3();
  const ringWorld = new THREE.Vector3();
  const screenPos = new THREE.Vector3();
  const edgePos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let state = scrollState();
  // Modo de depuración (?depurar): dibujar la escena en un estado dado, sin
  // depender del scroll ni de requestAnimationFrame (ej. pestañas ocultas).
  let forced = null;
  if (location.search.includes('depurar')) {
    window.__escena = {
      mostrar(value) {
        forced = value;
        frame();
        return { estado: state, globo: dialog?.classList.contains('visible') ? dialogText.textContent : null };
      },
    };
  }
  let blinkAt = 2;
  let flash = 0;

  // El globo: aparece cuando el robot llega, primero "escribiendo" y luego
  // el mensaje letra por letra. Se oculta mientras vuela.
  let shown = -1;
  let typingTimer = 0;
  function say(k) {
    if (!dialog || shown === k) return;
    shown = k;
    clearTimeout(typingTimer);
    dialog.dataset.lado = pose(k).side;
    dialog.classList.add('visible');
    if (reduce || forced !== null) {
      dialogText.textContent = MESSAGES[k];
      addAction(k);
      return;
    }
    dialogText.innerHTML = '<span class="puntos"><i></i><i></i><i></i></span>';
    const text = [...MESSAGES[k]];
    let i = 0;
    const type = () => {
      if (shown !== k) return;
      i += 1;
      dialogText.innerHTML = '';
      dialogText.append(text.slice(0, i).join(''));
      if (i < text.length) {
        dialogText.insertAdjacentHTML('beforeend', '<span class="cursor"></span>');
        typingTimer = setTimeout(type, 26);
      } else {
        addAction(k);
        // En el celular el globo se va a los segundos, para no tapar lo que se lee.
        if (camera.aspect < 1) typingTimer = setTimeout(() => shown === k && dialog.classList.remove('visible'), 9000);
      }
    };
    typingTimer = setTimeout(type, 650);
  }
  // Al terminar de hablar ofrece seguir (o, en el cierre, escribir por WhatsApp).
  function addAction(k) {
    if (k === LAST) {
      dialogText.insertAdjacentHTML('beforeend', '<a class="dialogo-accion" href="https://wa.me/573233272083?text=Hola%2C%20quiero%20conocer%20Leadbot" target="_blank" rel="noopener">Escribir por WhatsApp</a>');
    } else {
      dialogText.insertAdjacentHTML('beforeend', '<button type="button" class="dialogo-accion">Sigamos <span aria-hidden="true">→</span></button>');
      dialogText.querySelector('button').addEventListener('click', () => document.dispatchEvent(new CustomEvent('leadbot:siguiente')));
    }
  }

  function hush() {
    if (!dialog || shown === -1) return;
    shown = -1;
    clearTimeout(typingTimer);
    dialog.classList.remove('visible');
  }

  function placeDialog(radius) {
    if (!dialog || shown === -1) return;
    const side = dialog.dataset.lado;
    const w = dialog.offsetWidth;
    const h = dialog.offsetHeight;
    const x = (screenPos.x * 0.5 + 0.5) * innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * innerHeight;
    let left = x - w / 2;
    // Arriba, por encima de la antena (sale ~1,4 veces el ancho de la cabeza).
    let top = y - radius * 1.5 - h - 6;
    // Abajo, debajo de todo el cuerpo (los pies quedan ~2,4 veces el ancho de la cabeza).
    if (side === 'abajo') top = y + radius * 2.4 + 8;
    if (side === 'izquierda') {
      left = x - radius * 0.8 - w - 12;
      top = y - h / 2 - radius * 0.35;
    }
    if (side === 'derecha') {
      left = x + radius * 0.8 + 12;
      top = y - h / 2 - radius * 0.35;
    }
    const clampedLeft = Math.min(Math.max(12, left), innerWidth - w - 12);
    const clampedTop = Math.min(Math.max(70, top), innerHeight - h - 12);
    // La cola del globo sigue apuntando al robot aunque el globo se corra.
    // La caja crece desde la cola (transform-origin), que apunta al robot.
    if (side === 'arriba' || side === 'abajo') {
      const cola = Math.min(Math.max(22, x - clampedLeft), w - 22);
      dialog.style.setProperty('--cola', `${cola}px`);
      dialog.style.setProperty('--origen', `${cola}px ${side === 'arriba' ? '100%' : '0'}`);
    } else {
      const cola = Math.min(Math.max(20, y - radius * 0.35 - clampedTop), h - 20);
      dialog.style.setProperty('--cola', `${cola}px`);
      dialog.style.setProperty('--origen', `${side === 'izquierda' ? '100%' : '0'} ${cola}px`);
    }
    dialog.style.transform = `translate3d(${Math.round(clampedLeft)}px, ${Math.round(clampedTop)}px, 0)`;
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.25);
    const t = clock.elapsedTime;
    if (forced !== null) state = forced;
    else state += (scrollState() - state) * (1 - Math.exp(-dt * 4));
    const k = Math.min(LAST, Math.max(0, Math.floor(state + 1e-4)));
    const next = Math.min(LAST, k + 1);
    const p = k === LAST ? 0 : THREE.MathUtils.clamp(state - k, 0, 1);
    const e = easeInOut(p);
    const flight = Math.sin(Math.PI * e); // 0 en reposo, 1 a mitad del vuelo
    const A = pose(k);
    const B = pose(next);
    const direction = Math.sign(B.x - A.x) || 1;
    // El vuelo crece con la distancia: si el destino está cerca (ej. de "Qué
    // hace" a la frase) solo se desliza, sin acercarse a la cámara ni salirse
    // del cuadro.
    // En el celular siempre está en la misma esquina: el saltico se mantiene.
    const travel = THREE.MathUtils.clamp(Math.hypot(B.x - A.x, B.y - A.y) / 5, camera.aspect >= 1 ? 0.12 : 0.6, 1);
    const arc = flight * travel;

    // Posición: vuela en arco y pasa cerca de la cámara, por encima del texto.
    // En el celular solo da un saltico en su esquina.
    const wide = camera.aspect >= 1;
    const root = robot.root;
    root.position.set(
      THREE.MathUtils.lerp(A.x, B.x, e),
      THREE.MathUtils.lerp(A.y, B.y, e) + arc * (wide ? 0.9 : 0.35) + Math.sin(t * 1.6) * 0.07,
      THREE.MathUtils.lerp(A.z, B.z, e) + arc * (wide ? 3.2 : 0.8),
    );
    root.scale.setScalar(root.userData.base * THREE.MathUtils.lerp(A.s, B.s, e));
    // Se inclina hacia donde va; quieto, mira un poco al mouse.
    robot.rig.rotation.set(
      arc * 0.15 - pointer.y * 0.15,
      arc * direction * 0.55 + pointer.x * 0.35 * (1 - flight),
      -arc * direction * 0.32 + Math.sin(t * 1.2) * 0.03,
    );
    robot.head.rotation.set(-pointer.y * 0.2, pointer.x * 0.4, Math.sin(t * 0.9) * 0.04);

    // Brazos: mezcla el gesto del acto que deja con el del que llega.
    const from = armTargets(k, t);
    const to = armTargets(next, t);
    const mix = smooth(THREE.MathUtils.clamp((p - 0.6) / 0.4, 0, 1));
    // En vuelo los brazos se abren un poco hacia atrás.
    const flying = [0.35, -0.5, 0.35, 0.5];
    const lerp = (i) => THREE.MathUtils.lerp(from[i], to[i], mix) * (1 - arc * 0.6) + flying[i] * arc * 0.6;
    robot.arms[0].rotation.set(lerp(0), 0, lerp(1));
    robot.arms[1].rotation.set(lerp(2), 0, lerp(3));
    const coffee = (k === 1 ? 1 - mix : 0) + (next === 1 ? mix : 0);
    robot.mug.scale.setScalar(Math.max(0.001, coffee));

    // Parpadea, mira al mouse; la antena y el pecho brillan cuando trabaja.
    if (t > blinkAt) blinkAt = t + 2.5 + Math.random() * 3;
    const blink = blinkAt - t < 0.13 ? 0.12 : 1;
    robot.eyes.forEach((eye) => {
      eye.scale.y = blink * (k === 1 && flight < 0.2 ? 1.25 : 1);
      eye.position.x = eye.userData.home.x + pointer.x * 0.12;
      eye.position.y = eye.userData.home.y - pointer.y * 0.08;
    });
    const working = k === 2 ? 1 - flight : 0;
    flash = Math.max(0, flash - dt * 2.5);
    robot.ballMaterial.emissiveIntensity = 0.4 + flash * 2 + working * (0.5 + Math.sin(t * 10) * 0.5);
    robot.chestMaterial.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3 + working * 0.8;
    robot.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06 + arc * 0.25);
    robot.ring.material.opacity = 0.55 + Math.sin(t * 4) * 0.15 + arc * 0.3;

    root.updateMatrixWorld(true);
    robot.head.getWorldPosition(headWorld);
    robot.ring.getWorldPosition(ringWorld);

    // Cada acto con su objeto; aparecen y se guardan al cambiar de acto.
    const weights = Array.from({ length: LAST + 1 }, (_, s) => (k === s ? 1 - mix : 0) + (next === s && next !== k ? mix : 0));
    updateProps(weights, t);
    // Le llega un mensaje al celular: la antena destella.
    if (weights[0] + weights[2] > 0.5 && Math.floor(t / 2.4) !== lastPing) {
      lastPing = Math.floor(t / 2.4);
      flash = 1;
    }

    // Estela: salen chispas del anillo mientras vuela.
    const emit = Math.round(arc * 4);
    for (let n = 0; n < emit; n++) {
      const i = trailNext;
      trailNext = (trailNext + 1) % TRAIL;
      trailPositions.set([ringWorld.x + (Math.random() - 0.5) * 0.4, ringWorld.y, ringWorld.z + (Math.random() - 0.5) * 0.4], i * 3);
      trailVelocity.set([-direction * (0.4 + Math.random() * 0.8), -0.6 - Math.random() * 0.6, (Math.random() - 0.5) * 0.4], i * 3);
      trailAlpha[i] = 1;
    }
    for (let i = 0; i < TRAIL; i++) {
      if (trailAlpha[i] <= 0) continue;
      trailAlpha[i] = Math.max(0, trailAlpha[i] - dt * 1.4);
      trailPositions[i * 3] += trailVelocity[i * 3] * dt;
      trailPositions[i * 3 + 1] += trailVelocity[i * 3 + 1] * dt;
      trailPositions[i * 3 + 2] += trailVelocity[i * 3 + 2] * dt;
    }
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.aAlpha.needsUpdate = true;

    // Habla solo cuando está quieto en un acto.
    if (p < 0.03) say(k);
    else if (p > 0.97) say(next);
    else hush();
    screenPos.copy(headWorld).project(camera);
    tmp.copy(headWorld).add(edgePos.set(1.4 * root.scale.x, 0, 0)).project(camera);
    const radius = Math.abs(tmp.x - screenPos.x) * 0.5 * innerWidth;
    placeDialog(radius);

    // El aura de color detrás del texto sigue al robot.
    if (aura) {
      const x = (screenPos.x * 0.5 + 0.5) * innerWidth;
      const y = (-screenPos.y * 0.5 + 0.5) * innerHeight;
      aura.style.transform = `translate3d(${x}px, ${y}px, 0)`;
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

const TRAIL_VERTEX = /* glsl */ `
uniform float uSize; uniform float uPixelRatio;
attribute float aAlpha;
varying float vAlpha;
void main(){
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uPixelRatio * (10.0 / -mv.z) * (0.4 + aAlpha * 0.6);
  gl_Position = projectionMatrix * mv;
}`;

const TRAIL_FRAGMENT = /* glsl */ `
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float glow = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(0.45, 0.9, 1.0) * glow, glow * vAlpha);
}`;

// ── Arranque ─────────────────────────────────────────────────────────
if (gsap && ScrollTrigger && !reduce) {
  document.documentElement.classList.add('anim');
  gsap.registerPlugin(ScrollTrigger);
  setupScroll();
  setupHero();
  const pinned = { night: setupNight(), reply: setupReply() };
  setupFeatures();
  setupPlans();
  setupPhrase();
  setupClosing();
  scrollState = setupStateAnchors();
  setupNavigation(pinned);
}
setupScene(document.getElementById('escena'));
