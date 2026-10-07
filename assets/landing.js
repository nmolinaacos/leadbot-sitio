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

// Leadbot: robot chibi construido desde cero (sin modelos externos), según
// la imagen de referencia. Casco blanco brillante con visera sobre la frente,
// ranura y marcas; cara gris claro hundida con una línea de luz cian a los
// lados; ojos negros abombados con aro cian; nariz y sonrisa pequeñas;
// audífonos por capas con aro azul; cuello de anillos; pecho blanco con
// líneas de luz; abdomen de metal por segmentos; hombreras; antebrazos
// blindados; manos de dedos articulados y botas por piezas.
function makeRobot() {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const seg = modest ? 48 : 80;

  // ── Materiales
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f6f9, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.35 });
  const face = new THREE.MeshPhysicalMaterial({ color: 0xd3d9e0, roughness: 0.4, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 1.1 });
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xa2abb7, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.7 });
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x2a2f38, metalness: 0.6, roughness: 0.34, envMapIntensity: 1.3 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x07090d, roughness: 0.3, metalness: 0.2 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x020307, roughness: 0.02, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.4 });
  const blueRing = new THREE.MeshPhysicalMaterial({ color: 0x2f7dff, metalness: 0.55, roughness: 0.22, clearcoat: 1, emissive: 0x1f63ff, emissiveIntensity: 0.55, envMapIntensity: 1.4 });
  // Luces cian: sin mapeo de tonos para que el cian quede intenso.
  const glow = new THREE.MeshBasicMaterial({ color: 0x35d2ff, toneMapped: false });
  const glowSoft = new THREE.MeshBasicMaterial({ color: 0x1a8fe8, toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false });
  // Luz que destella con los mensajes (línea de la cara y del pecho).
  const ballMaterial = new THREE.MeshStandardMaterial({ color: 0x35d2ff, emissive: 0x18c0ff, emissiveIntensity: 1.2 });
  const chestMaterial = new THREE.MeshStandardMaterial({ color: 0x35d2ff, emissive: 0x18c0ff, emissiveIntensity: 1 });
  const highlight = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  const add = (parent, geometry, material, [x = 0, y = 0, z = 0] = [], rot) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  };
  // Pieza torneada (perfil de abajo hacia arriba: las caras miran afuera).
  const lathe = (points, n = 40) => new THREE.LatheGeometry(new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(n), seg);
  const tube = (points, radius, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), Math.max(32, points.length * 6), radius, 12, closed);

  // ── Cabeza (como la referencia): un elipsoide blanco perlado TALLADO, con
  // una gorra (pieza aparte) que sobresale sobre la frente; en la gorra, la
  // ranura con luz azul, rejillas y una placa grabada, y luz en el borde junto
  // a la oreja. En la cara: ojos en cuencas hundidas con resplandor azul,
  // cejas de luz, costuras laterales y la hendidura oscura de la mandíbula.
  const head = new THREE.Group();
  head.position.y = 1.0;
  rig.add(head);
  // Forma de la cabeza: superelipsoide (cubo de esquinas muy redondeadas),
  // apenas más ancha que alta y un poco plana al frente, como la referencia.
  // P = 2 sería una esfera; más alto, más cuadrada.
  const SX = 1.06, SY = 0.98, SZ = 0.97, P = 2.9;
  const supF = (x, y, z) => Math.pow(Math.abs(x / SX) ** P + Math.abs(y / SY) ** P + Math.abs(z / SZ) ** P, 1 / P);
  const supN = (x, y, z) => new THREE.Vector3(Math.sign(x) * Math.abs(x / SX) ** (P - 1) / SX, Math.sign(y) * Math.abs(y / SY) ** (P - 1) / SY, Math.sign(z) * Math.abs(z / SZ) ** (P - 1) / SZ).normalize();
  const headWhite = new THREE.MeshPhysicalMaterial({ color: 0xf1f3f6, roughness: 0.2, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.2, sheenColor: 0xdfe8ff, envMapIntensity: 1.3, vertexColors: true });
  const headHalo = new THREE.MeshBasicMaterial({ color: 0x1fb4ff, toneMapped: false, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });

  // Superficie del elipsoide en (x, y) y su normal.
  const faceZ = (x, y, r = 1.0) => SZ * Math.pow(Math.max(0, r ** P - Math.abs(x / SX) ** P - Math.abs(y / SY) ** P), 1 / P);
  const faceNormal = (x, y, z) => supN(x, y, z);
  const onHead = (x, y, lift = 0, r = 1.0) => {
    const z = faceZ(x, y, r);
    return new THREE.Vector3(x, y, z).add(faceNormal(x, y, z).multiplyScalar(lift));
  };
  // Tallado: hunde los vértices de una malla densa a lo largo de recorridos
  // (canales de perfil redondeado) o dentro de cuencas; oscurece el fondo.
  const hSmooth = (pts) => new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(Math.max(8, pts.length * 12));
  const hDist = (pts, x, y) => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)));
      const dx = a.x + vx * t - x, dy = a.y + vy * t - y;
      best = Math.min(best, dx * dx + dy * dy);
    }
    return Math.sqrt(best);
  };
  const carve = (geometry, features, minZ = 0.05) => {
    features.forEach((f) => {
      if (f.path) {
        f.pts = hSmooth(f.path);
        f.box = f.pts.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [Infinity, Infinity, -Infinity, -Infinity]).map((v, i) => v + (i < 2 ? -f.w : f.w));
      }
    });
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      let push = 0, shade = 1, tint = null, tk = 0;
      if (v.z > minZ) {
        for (const f of features) {
          let k = 0;
          if (f.path) {
            if (v.x < f.box[0] || v.y < f.box[1] || v.x > f.box[2] || v.y > f.box[3]) continue;
            const d = hDist(f.pts, v.x, v.y);
            if (d < f.w / 2) k = Math.pow(Math.cos((d / (f.w / 2)) * Math.PI / 2), 0.7);
          } else {
            // Cuenca: elipse con fondo plano y borde suave.
            const d = Math.hypot((v.x - f.c[0]) / f.r[0], (v.y - f.c[1]) / f.r[1]);
            if (d < 1) k = 1 - Math.pow(d, 6);
          }
          if (k > 0 && f.d * k > push) { push = f.d * k; shade = 1 - (1 - f.dark) * k; tint = f.tint || null; tk = k; }
        }
      }
      if (push > 0) {
        n.copy(supN(v.x, v.y, v.z));
        v.addScaledVector(n, -push);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
      if (tint) for (let c = 0; c < 3; c++) colors[i * 3 + c] = shade * (1 - tk + tk * tint[c]);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  };
  const ellipsoid = (r, w, h) => {
    const g = new THREE.SphereGeometry(r, w, h);
    // Cada vértice de la esfera se lleva a la superficie del superelipsoide.
    const pp = g.attributes.position;
    const d = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) {
      d.fromBufferAttribute(pp, i);
      d.multiplyScalar(r / supF(d.x, d.y, d.z));
      pp.setXYZ(i, d.x, d.y, d.z);
    }
    g.computeVertexNormals();
    return g;
  };
  const dense = modest ? [220, 120] : [380, 200];

  // Ojos (en coordenadas de la cabeza): centro y radio de la cuenca.
  const EYE = [[-0.37, -0.06], [0.37, -0.06]];
  const SOCKET = [0.28, 0.3];
  const JAW = [[-0.86, -0.3], [-0.68, -0.48], [-0.38, -0.585], [0, -0.61], [0.38, -0.585], [0.68, -0.48], [0.86, -0.3]];
  const headFeatures = [
    // Cuencas teñidas de azul (la luz de los ojos rebota en ellas).
    ...EYE.map((c) => ({ c, r: SOCKET, d: 0.07, dark: 0.95, tint: [0.22, 0.55, 1.0] })),
    // Cejas de luz: ranuras cortas sobre los ojos.
    ...[-1, 1].map((s) => ({ path: [[s * 0.53, 0.37], [s * 0.4, 0.4], [s * 0.27, 0.38]], w: 0.03, d: 0.016, dark: 0.3 })),
  ];
  // La cara (hundida dentro del casco) es apenas más gris que el casco.
  const skullMat = headWhite.clone();
  skullMat.color.set(0xe2e6eb);
  const skull = add(head, carve(ellipsoid(1.0, dense[0], dense[1]), headFeatures, 0.0), skullMat);
  skull.userData.carved = true;
  // Luz dentro de las ranuras de las cejas y resplandor de las cuencas.
  [-1, 1].forEach((s) => {
    const brow = [[s * 0.52, 0.37], [s * 0.4, 0.4], [s * 0.28, 0.38]].map(([x, y]) => onHead(x, y, -0.012));
    add(head, tube(brow, 0.011), glow);
    add(head, tube(brow, 0.03), headHalo);
  });

  // Casco: una sola pieza que cubre todo el cráneo (arriba, lados, nuca y
  // mentón) con una abertura al frente para la cara. El borde de arriba de la
  // abertura es grueso y sobresale sobre la frente; abajo, entre la cara y el
  // mentón del casco, queda la hendidura oscura de la mandíbula. Junto a las
  // orejas, el borde lleva una luz azul. Arriba: ranura con luz, rejilla y
  // placa grabada.
  const HELM_R = 1.07;
  // Abertura en coordenadas de la esfera: phi alrededor (frente en π/2),
  // theta desde arriba. Rectángulo de esquinas redondeadas (superelipse).
  const OPEN = { half: 1.02, top: 1.05, bottom: 2.25 };
  const openingOutline = (n = 200) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const e = 2 / 4.5;
    const cy = (OPEN.top + OPEN.bottom) / 2, hh = (OPEN.bottom - OPEN.top) / 2;
    const px = Math.sign(c) * Math.pow(Math.abs(c), e) * OPEN.half;
    let py = cy + Math.sign(s) * Math.pow(Math.abs(s), e) * hh;
    // El borde de abajo sube hacia los lados, como una sonrisa (la mandíbula).
    if (s > 0) py -= 0.3 * (px / OPEN.half) ** 2 * Math.pow(s, 0.5);
    return [Math.PI / 2 + px, py];
  });
  const outline = openingOutline();
  const onEll = (phi, theta, r) => {
    const d = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    return d.multiplyScalar(r / supF(d.x, d.y, d.z));
  };
  const helmMask = (() => {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 1024;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.beginPath();
    outline.forEach(([phi, theta], i) => {
      const x = (phi / (Math.PI * 2)) * c.width, y = (theta / Math.PI) * c.height;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  })();
  const helmFeatures = [
    // Ranura con luz azul arriba de la frente.
    { path: [[-0.2, 0.74], [0, 0.755], [0.2, 0.74]], w: 0.075, d: 0.04, dark: 0.3 },
    // Rejilla: cuatro ranuras cortas arriba a un lado.
    ...[0, 1, 2, 3].map((i) => ({ path: [[-0.6 + i * 0.045, 0.82 - i * 0.012], [-0.53 + i * 0.045, 0.86 - i * 0.012]], w: 0.016, d: 0.01, dark: 0.45 })),
  ];
  const helmGeo = carve(ellipsoid(HELM_R, dense[0], dense[1]), helmFeatures, 0.1);
  add(head, helmGeo, Object.assign(headWhite.clone(), { alphaMap: helmMask, alphaTest: 0.5, side: THREE.DoubleSide }));
  // Borde de la abertura: grueso y redondeado; arriba más grueso y salido.
  const rimMat = (() => { const m = headWhite.clone(); m.vertexColors = false; return m; })();
  add(head, tube(outline.map(([phi, theta]) => onEll(phi, theta, HELM_R - 0.022)), 0.03, true), rimMat);
  const brow = outline.filter(([phi, theta]) => theta < OPEN.top + 0.12).sort((a, b) => a[0] - b[0]);
  add(head, tube(brow.map(([phi, theta]) => onEll(phi, theta - 0.015, HELM_R + 0.02)), 0.06), rimMat);
  // Mandíbula: hendidura oscura en el borde de abajo, con una luz tenue adentro.
  const jaw = outline.filter(([phi, theta]) => theta > OPEN.top + 0.7 && Math.abs(phi - Math.PI / 2) < OPEN.half * 0.97).filter(([phi, theta], i, arr) => theta > (OPEN.top + OPEN.bottom) / 2 + 0.25).sort((a, b) => a[0] - b[0]);
  add(head, tube(jaw.map(([phi, theta]) => onEll(phi, theta - 0.02, 1.012)), 0.04), darkMetal);
  add(head, tube(jaw.map(([phi, theta]) => onEll(phi, theta - 0.035, 1.03)), 0.009), Object.assign(glowSoft.clone(), { opacity: 0.4 }));
  // Luz azul en el borde junto a las orejas (de la esquina de arriba hacia abajo).
  [-1, 1].forEach((s) => {
    const side = outline.filter(([phi, theta]) => s * (phi - Math.PI / 2) > OPEN.half * 0.82 && theta < OPEN.top + 0.75).sort((a, b) => a[1] - b[1]);
    const pts = side.map(([phi, theta]) => onEll(Math.PI / 2 + (phi - Math.PI / 2) * 0.985, theta + 0.015, HELM_R - 0.035));
    add(head, tube(pts, 0.012), glow);
    add(head, tube(pts, 0.032), headHalo);
  });
  // Luz en el fondo de la ranura de arriba.
  const slotPts = [[-0.18, 0.74], [0, 0.755], [0.18, 0.74]].map(([x, y]) => {
    const z = faceZ(x, y, HELM_R);
    return new THREE.Vector3(x, y, z - 0.03);
  });
  add(head, tube(slotPts, 0.02), glow);
  add(head, tube(slotPts.map((p) => p.clone().setZ(p.z + 0.025)), 0.045), headHalo);
  // Placa grabada a un lado del casco.
  const seamGrey = new THREE.MeshStandardMaterial({ color: 0x8a929e, roughness: 0.5 });
  const badgeAt = onEll(Math.PI / 2 - 0.85, 0.72, HELM_R + 0.004);
  const badge = add(head, new THREE.BoxGeometry(0.16, 0.09, 0.014), (() => { const m = headWhite.clone(); m.vertexColors = false; m.color.set(0xe6e9ee); return m; })(), [badgeAt.x, badgeAt.y, badgeAt.z]);
  badge.lookAt(badgeAt.clone().multiplyScalar(2));
  [-0.04, -0.013, 0.013, 0.04].forEach((dx) => add(badge, new THREE.BoxGeometry(0.006, 0.05, 0.003), seamGrey, [dx, 0, 0.008]));

  // Ojos: resplandor azul en la cuenca, aro cian, lente negro abombado con
  // un punto rojo arriba, un punto azul abajo y un reflejo blanco.
  const socketGlow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    grad.addColorStop(0, 'rgba(25,135,250,1)');
    grad.addColorStop(0.8, 'rgba(22,118,238,0.85)');
    grad.addColorStop(1, 'rgba(20,100,220,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  })();
  const eyes = EYE.map(([x, y]) => {
    const z = faceZ(x, y) - 0.07; // fondo de la cuenca
    const eye = new THREE.Group();
    eye.position.set(x, y, z);
    eye.scale.setScalar(0.9);
    eye.lookAt(new THREE.Vector3(x, y, z).add(faceNormal(x, y, z)));
    head.add(eye);
    const glowDisc = add(eye, new THREE.CircleGeometry(0.34, 48), socketGlow, [0, 0, 0.004]);
    glowDisc.scale.set(SOCKET[0] / 0.3, SOCKET[1] / 0.3, 1);
    add(eye, new THREE.TorusGeometry(0.25, 0.03, 16, seg), glow, [0, 0, 0.02]);
    add(eye, new THREE.TorusGeometry(0.27, 0.05, 16, seg), Object.assign(headHalo.clone(), { opacity: 0.16 }), [0, 0, 0.03]);
    const dome = add(eye, new THREE.SphereGeometry(0.235, seg, seg / 2), lens, [0, 0, 0]);
    dome.scale.set(0.96, 1.04, 0.55);
    add(eye, new THREE.TorusGeometry(0.17, 0.006, 8, seg), new THREE.MeshBasicMaterial({ color: 0x0f3f72, toneMapped: false }), [0, 0, 0.105]);
    add(eye, new THREE.SphereGeometry(0.026, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff5a6a, toneMapped: false }), [0.03, 0.095, 0.112]);
    add(eye, new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshBasicMaterial({ color: 0x5fe2ff, toneMapped: false }), [0.015, -0.1, 0.11]);
    const glare = add(eye, new THREE.TorusGeometry(0.13, 0.012, 8, 32, Math.PI * 0.45), highlight, [0.0, 0.0, 0.12], [0, 0, Math.PI * 0.18]);
    glare.material = Object.assign(highlight.clone(), { transparent: true, opacity: 0.75 });
    // Párpado (blanco de la cabeza): baja por delante del lente al parpadear.
    const lid = add(eye, new THREE.SphereGeometry(0.26, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), Object.assign(headWhite.clone(), { vertexColors: false }));
    lid.scale.z = 0.62;
    lid.rotation.x = -Math.PI / 2;
    eye.userData = { lid };
    return eye;
  });
  // Sonrisa pequeña con labio inferior.
  const mz = faceZ(0, -0.34);
  add(head, new THREE.TorusGeometry(0.1, 0.013, 10, 40, Math.PI * 0.6), darkMetal, [0, -0.3, mz - 0.006], [-0.34, 0, Math.PI * 1.2]);
  add(head, new THREE.TorusGeometry(0.06, 0.006, 8, 24, Math.PI * 0.5), Object.assign(darkMetal.clone(), { color: 0x9aa3b0 }), [0, -0.385, faceZ(0, -0.385) - 0.004], [-0.4, 0, Math.PI * 1.25]);

  // Audífonos: aro de luz cian, banda gris oscuro, tapa plana clara y un botón.
  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.set(side * 1.15, -0.06, -0.04);
    ear.rotation.z = (side * Math.PI) / 2;
    head.add(ear);
    add(ear, new THREE.CylinderGeometry(0.4, 0.42, 0.14, seg), darkMetal, [0, 0.0, 0]);
    add(ear, new THREE.TorusGeometry(0.41, 0.02, 16, seg), glow, [0, -0.07, 0], [Math.PI / 2, 0, 0]);
    add(ear, new THREE.TorusGeometry(0.41, 0.045, 16, seg), Object.assign(headHalo.clone(), { opacity: 0.18 }), [0, -0.07, 0], [Math.PI / 2, 0, 0]);
    add(ear, new THREE.CylinderGeometry(0.36, 0.38, 0.1, seg), new THREE.MeshPhysicalMaterial({ color: 0x5d6470, metalness: 0.7, roughness: 0.3, envMapIntensity: 1.5 }), [0, -0.1, 0]);
    const lid = add(ear, new THREE.CylinderGeometry(0.31, 0.33, 0.06, seg), new THREE.MeshPhysicalMaterial({ color: 0xece5dc, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }), [0, -0.16, 0]);
    lid.userData.cap = true;
    add(ear, new THREE.BoxGeometry(0.07, 0.06, 0.1), darkMetal, [0.02, -0.08, -0.4]);
  });

  // ── Cuello de anillos oscuros.
  [0.08, 0.01, -0.06].forEach((y, i) => add(rig, new THREE.CylinderGeometry(0.15 + i * 0.015, 0.16 + i * 0.015, 0.06, seg), i === 1 ? metal : darkMetal, [0, y, 0]));

  // ── Torso (como la referencia): una coraza en forma de escudo, gris claro
  // satinado, TALLADA: las líneas de ensamble y las ranuras son hendiduras
  // reales en la malla, las franjas azules son canales con neón en el fondo
  // y el escote es un hueco con paredes. A los lados, los puertos de los
  // hombros; abajo, filo metálico, junta oscura y pelvis con luz.
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xc3c9d1, roughness: 0.27, metalness: 0.3, clearcoat: 0.75, clearcoatRoughness: 0.12, sheen: 0.15, sheenColor: 0xdfe8ff, envMapIntensity: 1.45, vertexColors: true });
  const DEPTH = 0.74; // el frente es más plano que los lados
  const torsoProfile = new THREE.SplineCurve([[0, -0.9], [0.28, -0.885], [0.43, -0.82], [0.53, -0.68], [0.59, -0.48], [0.6, -0.3], [0.57, -0.17], [0.47, -0.09], [0.28, -0.055], [0, -0.05]].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(modest ? 160 : 300);
  const torsoR = (y) => {
    for (let i = 0; i < torsoProfile.length - 1; i++) {
      const a = torsoProfile[i], b = torsoProfile[i + 1];
      if (y >= a.y && y <= b.y) return a.x + ((y - a.y) / (b.y - a.y || 1)) * (b.x - a.x);
    }
    return 0.3;
  };
  const onTorso = (x, y, lift = 0) => {
    const r = torsoR(y);
    const z = DEPTH * Math.sqrt(Math.max(0, r * r - x * x));
    return new THREE.Vector3(x, y, z + lift);
  };
  // Recorridos en el frente (x, y). Simétricos a ambos lados.
  const mirror = (pts) => [pts, pts.map(([x, y]) => [-x, y])];
  const U = [[0.2, -0.08], [0.4, -0.16], [0.47, -0.34], [0.43, -0.55], [0.3, -0.7], [0.12, -0.77], [0.0, -0.785]];
  const STRIP = [[0.33, -0.2], [0.355, -0.32], [0.35, -0.46], [0.31, -0.57], [0.24, -0.62], [0.15, -0.64]];
  // Líneas de ensamble extra a los costados del pecho y una banda baja.
  const SIDE = [[0.47, -0.1], [0.55, -0.24], [0.565, -0.4], [0.52, -0.58], [0.43, -0.72]];
  const LOW = [[0.28, -0.8], [0.14, -0.835], [0, -0.845]];
  const VENTS = [0, 1, 2].map((i) => [[0.2 + i * 0.035, -0.3 - i * 0.012], [0.23 + i * 0.035, -0.42 - i * 0.012]]);
  const NOTCH = [[-0.2, -0.062], [0.2, -0.062], [0.12, -0.235], [-0.12, -0.235]];
  const grooves = [
    ...mirror(U).map((p) => ({ p, w: 0.026, d: 0.014, dark: 0.45 })),
    ...mirror(STRIP).map((p) => ({ p, w: 0.066, d: 0.032, dark: 0.25 })),
    ...mirror(SIDE).map((p) => ({ p, w: 0.02, d: 0.011, dark: 0.5 })),
    ...mirror(LOW).map((p) => ({ p, w: 0.02, d: 0.01, dark: 0.55 })),
    ...VENTS.flatMap((v) => mirror(v)).map((p) => ({ p, w: 0.021, d: 0.012, dark: 0.5 })),
    // Borde del escote: un filo hundido alrededor del hueco.
    { p: [...NOTCH, NOTCH[0]], w: 0.02, d: 0.012, dark: 0.3 },
  ];
  // Distancia de un punto a un recorrido (polilínea suavizada).
  const smoothPath = (pts) => new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(Math.max(8, pts.length * 10));
  grooves.forEach((g) => {
    g.pts = g.p.length > 2 && g !== grooves[grooves.length - 1] ? smoothPath(g.p) : g.p.map(([x, y]) => new THREE.Vector2(x, y));
    // Caja del recorrido: los vértices lejos ni se miden.
    g.box = g.pts.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [Infinity, Infinity, -Infinity, -Infinity]).map((v, i) => v + (i < 2 ? -g.w : g.w));
  });
  const distTo = (pts, x, y) => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)));
      const dx = a.x + vx * t - x, dy = a.y + vy * t - y;
      best = Math.min(best, dx * dx + dy * dy);
    }
    return Math.sqrt(best);
  };
  const insideNotch = (x, y) => {
    let inside = false;
    for (let i = 0, j = NOTCH.length - 1; i < NOTCH.length; j = i++) {
      const [xi, yi] = NOTCH[i], [xj, yj] = NOTCH[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // El frente (donde va el tallado) con muchos más vértices que la espalda.
  const FRONT = 1.7;
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, modest ? 420 : 760, -FRONT, FRONT * 2);
  const torsoBack = new THREE.LatheGeometry(torsoProfile, 90, FRONT, Math.PI * 2 - FRONT * 2);
  {
    const pos = torsoGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      let push = 0, shade = 1;
      if (v.z > 0.02) {
        for (const g of grooves) {
          if (v.x < g.box[0] || v.y < g.box[1] || v.x > g.box[2] || v.y > g.box[3]) continue;
          const d = distTo(g.pts, v.x, v.y);
          if (d < g.w / 2) {
            // Canal de perfil redondeado.
            const k = Math.pow(Math.cos((d / (g.w / 2)) * Math.PI / 2), 0.7);
            if (g.d * k > push) { push = g.d * k; shade = 1 - (1 - g.dark) * k; }
          }
        }
        // Escote: hueco profundo con paredes.
        if (v.y > -0.25 && Math.abs(v.x) < 0.21 && insideNotch(v.x, v.y)) {
          const edge = Math.min(...NOTCH.map((a, j) => distTo([new THREE.Vector2(...a), new THREE.Vector2(...NOTCH[(j + 1) % NOTCH.length])], v.x, v.y)));
          const k = sstep(0.004, 0.02, edge);
          if (0.09 * k > push) { push = 0.09 * k; shade = 1 - 0.8 * k; }
        }
      }
      if (push > 0) {
        const r = Math.hypot(v.x, v.z) || 1;
        // Hacia adentro (en el sistema del torno; el frente se aplana después).
        v.x -= (v.x / r) * push;
        v.z -= (v.z / r) * (push / DEPTH);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
    }
    torsoGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    torsoGeo.computeVertexNormals();
  }
  const torso = add(rig, torsoGeo, shellMat);
  torso.scale.z = DEPTH;
  add(rig, torsoBack, Object.assign(shellMat.clone(), { vertexColors: false })).scale.z = DEPTH;
  // Neón azul en el fondo de los canales de las franjas.
  const halo = new THREE.MeshBasicMaterial({ color: 0x1fb4ff, toneMapped: false, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const p of mirror(STRIP)) {
    add(rig, tube(p.map(([x, y]) => onTorso(x, y, -0.02)), 0.026), glow);
    // Halo: la luz se derrama un poco sobre los bordes del canal.
    add(rig, tube(p.map(([x, y]) => onTorso(x, y, 0.006)), 0.05), halo);
    add(rig, tube(p.map(([x, y]) => onTorso(x, y, 0.01)), 0.085), Object.assign(halo.clone(), { opacity: 0.1 }));
  }
  // Piezas oscuras y luz en el fondo del escote.
  const nh = onTorso(0, -0.15);
  const inner = new THREE.Group();
  inner.position.set(0, -0.148, nh.z - 0.078);
  inner.rotation.x = -0.2;
  rig.add(inner);
  // Fondo oscuro con costillas, un conector redondo con anillo, tubos y luces.
  add(inner, new THREE.BoxGeometry(0.3, 0.16, 0.01), darkMetal, [0, 0, -0.012]);
  [-0.1, -0.06, 0.06, 0.1].forEach((x) => add(inner, new THREE.BoxGeometry(0.012, 0.12, 0.02), metal, [x, 0, 0]));
  add(inner, new THREE.CylinderGeometry(0.042, 0.042, 0.03, 32), metal, [0, 0.01, 0.01], [Math.PI / 2, 0, 0]);
  add(inner, new THREE.TorusGeometry(0.042, 0.008, 10, 32), chestMaterial, [0, 0.01, 0.027]);
  add(inner, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 20), darkMetal, [0, 0.01, 0.03], [Math.PI / 2, 0, 0]);
  add(inner, new THREE.CylinderGeometry(0.01, 0.01, 0.22, 12), metal, [0, -0.055, 0.008], [0, 0, Math.PI / 2]);
  add(inner, new THREE.CylinderGeometry(0.008, 0.008, 0.18, 12), darkMetal, [0, 0.06, 0.006], [0, 0, Math.PI / 2]);
  [-1, 1].forEach((side) => add(inner, new THREE.SphereGeometry(0.009, 10, 8), glow, [side * 0.08, 0.05, 0.016]));
  add(inner, new THREE.BoxGeometry(0.15, 0.012, 0.01), glow, [0, -0.07, 0.014]);
  // Puertos de los hombros: aro oscuro hundido con un arco de luz cian abajo.
  [-1, 1].forEach((side) => {
    const port = new THREE.Group();
    port.position.set(side * 0.575, -0.28, 0.03);
    port.rotation.y = (side * Math.PI) / 2;
    rig.add(port);
    // Hueco profundo, aro grueso, rotor con tornillos y un arco de luz largo.
    add(port, new THREE.CylinderGeometry(0.25, 0.25, 0.08, seg), black, [0, 0, -0.01], [Math.PI / 2, 0, 0]);
    add(port, new THREE.TorusGeometry(0.25, 0.045, 16, seg), darkMetal, [0, 0, 0.025]);
    add(port, new THREE.TorusGeometry(0.205, 0.012, 10, seg), metal, [0, 0, 0.03]);
    add(port, new THREE.CylinderGeometry(0.12, 0.12, 0.04, seg), darkMetal, [0, 0, 0.02], [Math.PI / 2, 0, 0]);
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      add(port, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10), metal, [Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.045], [Math.PI / 2, 0, 0]);
    }
    add(port, new THREE.TorusGeometry(0.175, 0.016, 10, seg, Math.PI * 1.05), glow, [0, 0, 0.035], [0, 0, Math.PI * 0.975]);
    add(port, new THREE.TorusGeometry(0.175, 0.04, 10, seg, Math.PI * 1.05), halo, [0, 0, 0.04], [0, 0, Math.PI * 0.975]);
  });
  // Filo metálico abajo, junta oscura y pelvis clara con luz al costado.
  add(rig, new THREE.TorusGeometry(0.3, 0.03, 12, seg), metal, [0, -0.875, 0], [Math.PI / 2, 0, 0]).scale.set(1, DEPTH, 1);
  add(rig, new THREE.CylinderGeometry(0.24, 0.26, 0.08, seg), darkMetal, [0, -0.92, 0]).scale.set(1, 1, 0.85);
  const pelvis = add(rig, lathe([[0, -1.03], [0.22, -1.02], [0.33, -0.98], [0.35, -0.94], [0.3, -0.92], [0, -0.92]]), Object.assign(shellMat.clone(), { vertexColors: false }));
  pelvis.scale.z = 0.8;
  [-1, 1].forEach((side) => add(rig, new THREE.CapsuleGeometry(0.012, 0.06, 4, 8), chestMaterial, [side * 0.32, -0.97, 0.12], [0, 0, Math.PI / 2 + side * 0.2]));

  // ── Brazos: hombrera blanca con luz, brazo gris, codo, antebrazo blindado y mano.
  const HAND = -0.8;
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.72, -0.22, 0);
    const pad = add(pivot, new THREE.SphereGeometry(0.215, seg, seg / 2), white, [side * 0.03, 0.02, 0]);
    pad.scale.set(1.08, 0.95, 1);
    add(pivot, tube([[0.12, 0.14], [0.17, 0.04], [0.16, -0.08]].map(([a, b]) => new THREE.Vector3(side * (0.03 + a * 0.5), b, 0.18)), 0.01), chestMaterial);
    add(pivot, new THREE.CylinderGeometry(0.075, 0.075, 0.1, 20), darkMetal, [0, -0.19, 0]);
    add(pivot, new THREE.CapsuleGeometry(0.085, 0.1, 6, 16), metal, [0, -0.3, 0]);
    add(pivot, new THREE.SphereGeometry(0.088, 20, 12), darkMetal, [0, -0.43, 0]);
    const fore = add(pivot, lathe([[0.09, -0.7], [0.128, -0.66], [0.135, -0.54], [0.105, -0.48]]), white);
    fore.scale.z = 0.92;
    add(pivot, new THREE.CapsuleGeometry(0.009, 0.12, 4, 8), chestMaterial, [side * 0.03, -0.59, 0.122]);
    add(pivot, new THREE.CylinderGeometry(0.06, 0.066, 0.06, 16), darkMetal, [0, -0.72, 0]);
    // Mano mecánica: palma, cuatro dedos de dos falanges y pulgar.
    add(pivot, new THREE.BoxGeometry(0.17, 0.12, 0.075), metal, [0, -0.8, 0.01]);
    [-0.06, -0.02, 0.02, 0.06].forEach((x, i) => {
      const splay = (i - 1.5) * 0.07;
      add(pivot, new THREE.SphereGeometry(0.022, 10, 8), darkMetal, [x, -0.865, 0.015]);
      add(pivot, new THREE.CapsuleGeometry(0.02, 0.06, 4, 8), metal, [x + splay * 0.05, -0.91, 0.02], [0.2, 0, splay]);
      add(pivot, new THREE.CapsuleGeometry(0.018, 0.045, 4, 8), metal, [x + splay * 0.12, -0.975, 0.04], [0.45, 0, splay]);
    });
    add(pivot, new THREE.CapsuleGeometry(0.022, 0.06, 4, 8), metal, [-side * 0.1, -0.81, 0.05], [0.4, 0, -side * 0.9]);
    rig.add(pivot);
    return pivot;
  });

  // ── Piernas cortas: muslo blanco, rodilla oscura y botas por piezas.
  [-1, 1].forEach((side) => {
    const x = side * 0.2;
    add(rig, new THREE.SphereGeometry(0.1, 20, 12), darkMetal, [x, -1.0, 0]);
    const thigh = add(rig, extrude(roundedRect(0.3, 0.2, 0.09), 0.28, 0.045), white, [x * 1.05, -1.11, 0.01]);
    thigh.rotation.x = 0.04;
    add(rig, new THREE.CylinderGeometry(0.085, 0.085, 0.1, 20), darkMetal, [x, -1.24, 0]);
    add(rig, new THREE.CylinderGeometry(0.1, 0.115, 0.08, 20), metal, [x, -1.31, 0]);
    const bx = x * 1.16;
    add(rig, extrude(roundedRect(0.42, 0.22, 0.1), 0.5, 0.055), white, [bx, -1.42, 0.09]);
    add(rig, new THREE.BoxGeometry(0.46, 0.06, 0.56), metal, [bx, -1.555, 0.09]);
    add(rig, new THREE.BoxGeometry(0.46, 0.04, 0.58), darkMetal, [bx, -1.605, 0.09]);
    add(rig, new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24), metal, [bx + side * 0.235, -1.44, 0.06], [0, 0, Math.PI / 2]);
    add(rig, new THREE.CylinderGeometry(0.03, 0.03, 0.025, 16), chestMaterial, [bx + side * 0.24, -1.44, 0.06], [0, 0, Math.PI / 2]);
    add(rig, new THREE.BoxGeometry(0.14, 0.02, 0.01), chestMaterial, [bx, -1.4, 0.37]);
  });

  // Taza de café en la mano izquierda (la noche: no duerme).
  const mug = new THREE.Group();
  mug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.27, 32), glossy(0xffb547)));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.026, 12, 24), glossy(0xffb547));
  handle.position.x = 0.16;
  mug.add(handle);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 32), glossy(0x4a2a12, { roughness: 0.4 }));
  coffee.position.y = 0.13;
  mug.add(coffee);
  mug.position.set(0, HAND - 0.12, 0.12);
  mug.scale.setScalar(0.001);
  arms[0].add(mug);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 16, 72), new THREE.MeshBasicMaterial({ color: 0x6ff0ff, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.72;
  rig.add(ring);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  rig.position.y = -(box.min.y + box.max.y) / 2;
  root.userData.base = 2.7 / (box.max.y - box.min.y);
  const fit = { hand: HAND - 0.04, desk: { y: -0.68, z: 1.0, floor: -1.63 }, props: 0.78 };
  return { root, rig, head, eyes, ballMaterial, chestMaterial, arms, mug, ring, fit };
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
  const { y: deskY, z: deskZ, floor } = robot.fit.desk;
  desk.position.set(0, deskY, deskZ);
  add(desk, new THREE.BoxGeometry(3.0, 0.1, 1.3), wood);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(desk, new THREE.CylinderGeometry(0.045, 0.045, deskY - floor, 16), chrome, [sx * 1.38, -(deskY - floor) / 2, sz * 0.55])));
  add(desk, new THREE.BoxGeometry(1.1, 0.04, 0.72), gunmetal, [0.15, 0.07, -0.08]);
  const lid = new THREE.Group();
  lid.position.set(0.15, 0.09, 0.28);
  lid.rotation.x = 0.22;
  desk.add(lid);
  add(lid, new THREE.BoxGeometry(1.1, 0.74, 0.035), gunmetal, [0, 0.37, 0]);
  const logo = add(lid, bubbleGeometry(), glow, [0, 0.38, 0.03]);
  logo.scale.setScalar(0.09);
  // Una matita en la esquina del escritorio.
  const plant = new THREE.Group();
  plant.position.set(1.32, 0.05, 0.5);
  desk.add(plant);
  add(plant, new THREE.CylinderGeometry(0.15, 0.12, 0.26, 32), glossy(0xf2f4f7), [0, 0.13, 0]);
  add(plant, new THREE.CylinderGeometry(0.135, 0.135, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.9 }), [0, 0.25, 0]);
  const leaf = new THREE.MeshPhysicalMaterial({ color: 0x3f9a5c, roughness: 0.45, clearcoat: 0.4 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const blade = add(plant, new THREE.SphereGeometry(1, 16, 8), leaf, [Math.cos(a) * 0.08, 0.42 + (i % 2) * 0.06, Math.sin(a) * 0.08], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
    blade.scale.set(0.05, 0.2, 0.02);
  }

  // Puntos de agarre en cada mano (en el sistema del brazo).
  const hands = robot.arms.map((arm) => {
    const anchor = new THREE.Object3D();
    anchor.position.set(0, robot.fit.hand, 0.04);
    arm.add(anchor);
    return anchor;
  });
  const handPos = [new THREE.Vector3(), new THREE.Vector3()];
  const mid = new THREE.Vector3();
  const place = (prop, at, weight, [ox, oy, oz], [rx, ry, rz] = [0, 0, 0]) => {
    prop.position.copy(at).add(mid.set(ox, oy, oz));
    prop.rotation.set(rx, ry, rz);
    prop.scale.setScalar(Math.max(0.001, weight * robot.fit.props));
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
    place(phone, phoneAt, phoneW, [0, 0.3, 0.1], [-0.2, -0.15 * (1 - share), 0.08 * (1 - share)]);
    place(tablet, center, w[3], [0, 0.2, 0.12], [-0.18, 0, 0]);
    place(bell, handPos[1], w[4], [0, 0.02, 0.02]);
    ring.rotation.z = Math.sin(t * 14) * 0.35 * w[4];
    place(gift, center, w[5], [0, 0.1, 0.18], [0, 0.25, 0]);
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
  [4.35, -1.75, 0.2, 0.58, 'izquierda', '.hero-tarjetas'],
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
    // Con la cabeza grande, saluda con el brazo hacia el lado y un poco al frente.
    if (k === LAST) return [idle[0], idle[1], -0.55, 1.45 + Math.sin(t * 7) * 0.28]; // se despide
    if (k === 0) return [-0.55, -1.45 + Math.sin(t * 7) * 0.28, -1.25, -0.15]; // saluda y muestra el celular
    if (k === 1) return [-1.45 + Math.max(0, Math.sin(t * 0.9)) * -0.45, 0.35, -1.0 + Math.sin(t * 16) * 0.12, -0.15]; // café y escribe en la laptop
    if (k === 2) return [-1.3 + tap, 0.38, -1.3, -0.38]; // escribe en el celular con las dos manos
    if (k === 3) return [-1.0, 0.5, -1.0, -0.5]; // muestra la tablet
    if (k === 4) return [idle[0], idle[1], -0.5, 1.5 + Math.sin(t * 12) * 0.08]; // levanta y toca la campana
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
  let portrait = null;
  let portraitScale = 2.1;
  if (location.search.includes('depurar')) {
    window.__escena = {
      mostrar(value) {
        forced = value;
        frame();
        return { estado: state, globo: dialog?.classList.contains('visible') ? dialogText.textContent : null };
      },
      // Robot grande y centrado, girado `giro` radianes (para revisarlo de cerca).
      retrato(giro = 0, escala = 2.1) {
        portrait = giro;
        portraitScale = escala;
        frame();
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
    // Parpadeo: el párpado baja por delante del lente (de -90° a +90°).
    const closed = blink < 1 ? 1 : 0;
    robot.eyes.forEach((eye) => {
      eye.userData.lid.rotation.x = -Math.PI / 2 + closed * Math.PI;
    });
    const working = k === 2 ? 1 - flight : 0;
    flash = Math.max(0, flash - dt * 2.5);
    robot.ballMaterial.emissiveIntensity = 1.1 + flash * 1.6 + working * (0.4 + Math.sin(t * 10) * 0.4);
    robot.chestMaterial.emissiveIntensity = 1 + Math.sin(t * 3) * 0.35 + working * 0.8;
    robot.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06 + arc * 0.25);
    robot.ring.material.opacity = 0.55 + Math.sin(t * 4) * 0.15 + arc * 0.3;

    if (portrait !== null) {
      // De pie, en reposo y sin objetos (como la imagen de referencia).
      robot.arms[0].rotation.set(0.08, 0, -0.22);
      robot.arms[1].rotation.set(-0.1, 0, 0.3);
      robot.mug.scale.setScalar(0.001);
      root.position.set(0, 0, 0);
      root.scale.setScalar(root.userData.base * portraitScale);
      robot.rig.rotation.set(0.05, portrait, 0);
      robot.head.rotation.set(0, 0, 0);
    }
    root.updateMatrixWorld(true);
    robot.head.getWorldPosition(headWorld);
    robot.ring.getWorldPosition(ringWorld);

    // Cada acto con su objeto; aparecen y se guardan al cambiar de acto.
    const weights = Array.from({ length: LAST + 1 }, (_, s) => (portrait !== null ? 0 : (k === s ? 1 - mix : 0) + (next === s && next !== k ? mix : 0)));
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
