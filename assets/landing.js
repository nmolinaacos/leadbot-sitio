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

  // ── Cabeza
  const head = new THREE.Group();
  head.position.y = 1.0;
  rig.add(head);
  const SX = 1.13, SY = 0.97, SZ = 0.98; // la cabeza es un elipsoide un poco ancho
  const shell = new THREE.Group();
  shell.scale.set(SX, SY, SZ);
  head.add(shell);
  // Ventana de la cara en coordenadas de la esfera: phi alrededor (frente en
  // π/2), theta desde arriba.
  const WIN = { phi: 2.06, top: 1.2, bottom: 2.3, round: 0.42 };
  // Contorno de la ventana (rectángulo redondeado en phi/theta).
  const windowOutline = (n = 160) => {
    const pts = [];
    const hw = WIN.phi / 2, h = WIN.bottom - WIN.top, rr = WIN.round;
    const cx = Math.PI / 2, cy = (WIN.top + WIN.bottom) / 2, hh = h / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // Superelipse: esquinas redondeadas.
      const c = Math.cos(a), s = Math.sin(a);
      const e = 2 / 3.6;
      const px = Math.sign(c) * Math.pow(Math.abs(c), e) * hw;
      const py = Math.sign(s) * Math.pow(Math.abs(s), e) * hh;
      pts.push([cx + px, cy + py]);
    }
    return pts;
  };
  const outline = windowOutline();
  const onSphere = ([phi, theta], r) => new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
  // Máscara del casco: blanco = casco, negro = ventana (usa las UV de la esfera).
  const mask = (() => {
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
  add(shell, new THREE.SphereGeometry(1.0, seg, seg), face); // cara (se ve por la ventana)
  add(shell, new THREE.SphereGeometry(1.045, seg * 1.5, seg), Object.assign(white.clone(), { alphaMap: mask, alphaTest: 0.5, side: THREE.DoubleSide }));
  // Borde redondeado alrededor de la cara (da grosor al casco).
  add(shell, tube(outline.map((p) => onSphere(p, 1.03)), 0.034, true), white);
  // Visera: el borde de arriba sobresale sobre la frente.
  const brim = outline.filter(([phi, theta]) => theta < WIN.top + 0.16 && Math.abs(phi - Math.PI / 2) < WIN.phi / 2 - 0.05);
  brim.sort((a, b) => a[0] - b[0]);
  add(shell, tube(brim.map(([phi, theta]) => onSphere([phi, theta - 0.02], 1.07)), 0.05), white);
  // Línea de luz cian entre el casco y la cara, en los costados y abajo.
  const sides = outline.filter(([phi, theta]) => theta > WIN.top + 0.22);
  const leftSide = sides.filter(([phi]) => phi < Math.PI / 2).sort((a, b) => a[1] - b[1]);
  const rightSide = sides.filter(([phi]) => phi >= Math.PI / 2).sort((a, b) => a[1] - b[1]);
  // Un poco hacia adentro de la ventana, para que se vea junto al borde.
  const inward = ([phi, theta]) => [Math.PI / 2 + (phi - Math.PI / 2) * 0.955, (WIN.top + WIN.bottom) / 2 + (theta - (WIN.top + WIN.bottom) / 2) * 0.94];
  for (const line of [leftSide, rightSide]) add(shell, tube(line.map((p) => onSphere(inward(p), 1.008)), 0.012), ballMaterial);
  // Ranura sobre la visera y marcas pequeñas del casco.
  const slotAt = onSphere([Math.PI / 2, 0.86], 1.045);
  const slot = add(shell, new THREE.CapsuleGeometry(0.045, 0.3, 8, 20), black, [slotAt.x, slotAt.y, slotAt.z], [Math.PI / 2 - 0.86, 0, Math.PI / 2]);
  slot.scale.set(1, 1, 0.45);
  [[2.2, 0.62, 0.11], [2.12, 0.7, 0.07]].forEach(([phi, theta, w]) => {
    const p = onSphere([phi, theta], 1.046);
    const mark = add(shell, new THREE.BoxGeometry(w, 0.025, 0.01), darkMetal, [p.x, p.y, p.z]);
    mark.lookAt(p.clone().multiplyScalar(2));
  });
  // Línea de unión del casco: de oreja a oreja por encima, detrás de la visera.
  add(shell, new THREE.TorusGeometry(1.046, 0.007, 8, seg * 2, Math.PI), darkMetal, [0, 0, -0.32], [0, 0, 0]);

  // Superficie de la cara en (x, y): profundidad y normal del elipsoide.
  const faceZ = (x, y, r = 1.0) => SZ * r * Math.sqrt(Math.max(0, 1 - (x / (SX * r)) ** 2 - (y / (SY * r)) ** 2));
  const faceNormal = (x, y, z) => new THREE.Vector3(x / SX ** 2, y / SY ** 2, z / SZ ** 2).normalize();

  // Ojos: borde oscuro, aro cian que brilla, lente negro abombado y reflejos.
  const eyes = [-1, 1].map((side) => {
    const x = side * 0.41, y = -0.03, z = faceZ(x, y) - 0.015;
    const eye = new THREE.Group();
    eye.position.set(x, y, z);
    eye.lookAt(new THREE.Vector3(x, y, z).add(faceNormal(x, y, z)));
    head.add(eye);
    add(eye, new THREE.CylinderGeometry(0.31, 0.31, 0.06, seg), darkMetal, [0, 0, -0.02], [Math.PI / 2, 0, 0]);
    add(eye, new THREE.TorusGeometry(0.285, 0.022, 14, seg), darkMetal, [0, 0, 0.012]);
    add(eye, new THREE.TorusGeometry(0.255, 0.034, 18, seg), glow, [0, 0, 0.02]);
    add(eye, new THREE.TorusGeometry(0.228, 0.014, 12, seg), glowSoft, [0, 0, 0.03]);
    const dome = add(eye, new THREE.SphereGeometry(0.232, seg, seg / 2), lens, [0, 0, 0]);
    dome.scale.z = 0.52;
    add(eye, new THREE.TorusGeometry(0.15, 0.006, 8, seg), new THREE.MeshBasicMaterial({ color: 0x0f3f72, toneMapped: false }), [0, 0, 0.1]);
    add(eye, new THREE.SphereGeometry(0.052, 16, 10), highlight, [0.075, 0.085, 0.105]);
    add(eye, new THREE.SphereGeometry(0.024, 12, 8), highlight, [-0.085, -0.075, 0.1]);
    // Párpado (blanco del casco): baja por delante del lente al parpadear.
    const lid = add(eye, new THREE.SphereGeometry(0.245, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), white);
    lid.scale.z = 0.62;
    lid.rotation.x = -Math.PI / 2;
    eye.userData = { lid };
    return eye;
  });
  // Nariz apenas marcada y sonrisa pequeña.
  const nz = faceZ(0, -0.27);
  const nose = add(head, new THREE.SphereGeometry(0.038, 16, 10), face, [0, -0.27, nz - 0.01]);
  nose.scale.set(1.25, 0.6, 0.55);
  const mz = faceZ(0, -0.36);
  add(head, new THREE.TorusGeometry(0.085, 0.011, 10, 40, Math.PI * 0.62), darkMetal, [0, -0.33, mz - 0.006], [-0.36, 0, Math.PI * 1.19]);

  // Audífonos: carcasa blanca, aro azul, disco oscuro y tapa blanca.
  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.set(side * 1.16, -0.02, -0.06);
    ear.rotation.z = (side * Math.PI) / 2;
    head.add(ear);
    add(ear, lathe([[0, -0.13], [0.33, -0.13], [0.38, -0.1], [0.4, -0.02], [0.4, 0.06], [0.34, 0.11], [0, 0.11]]), white);
    add(ear, new THREE.TorusGeometry(0.29, 0.05, 18, seg), blueRing, [0, -0.13, 0], [Math.PI / 2, 0, 0]);
    add(ear, new THREE.CylinderGeometry(0.235, 0.235, 0.05, seg), darkMetal, [0, -0.145, 0]);
    const cap = add(ear, new THREE.SphereGeometry(0.15, seg, seg / 2), white, [0, -0.15, 0]);
    cap.scale.y = 0.35;
  });

  // ── Cuello de anillos oscuros.
  [0.08, 0.01, -0.06].forEach((y, i) => add(rig, new THREE.CylinderGeometry(0.15 + i * 0.015, 0.16 + i * 0.015, 0.06, seg), i === 1 ? metal : darkMetal, [0, y, 0]));

  // ── Torso: pecho blanco, placa gris y líneas de luz.
  const chestProfile = [[0, -0.6], [0.32, -0.59], [0.43, -0.47], [0.51, -0.28], [0.5, -0.14], [0.36, -0.09], [0, -0.08]];
  const chest = add(rig, lathe(chestProfile), white);
  chest.scale.z = 0.78;
  const chestZ = (x, y) => {
    // Radio del torso a esa altura (interpolado) → profundidad del frente.
    let r = 0.5;
    for (let i = 0; i < chestProfile.length - 1; i++) {
      const [r0, y0] = chestProfile[i], [r1, y1] = chestProfile[i + 1];
      if (y >= y0 && y <= y1) r = r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
    }
    return 0.78 * Math.sqrt(Math.max(0, r * r - x * x));
  };
  // Placa del cuello (gris) y líneas de luz en el pecho, como en la referencia.
  add(rig, new THREE.BoxGeometry(0.2, 0.08, 0.05), metal, [0, -0.13, chestZ(0, -0.13) - 0.005], [-0.25, 0, 0]);
  [-1, 1].forEach((side) => {
    const pts = [[0.3, -0.16], [0.22, -0.26], [0.12, -0.35], [0.06, -0.44]].map(([x, y]) => new THREE.Vector3(side * x, y, chestZ(x, y) + 0.004));
    add(rig, tube(pts, 0.012), chestMaterial);
  });
  // Abdomen de metal por segmentos y cadera blanca.
  const belly = add(rig, lathe([[0, -0.86], [0.27, -0.85], [0.3, -0.75], [0.29, -0.63], [0.25, -0.58], [0, -0.58]]), metal);
  belly.scale.z = 0.82;
  [-0.64, -0.71, -0.78].forEach((y) => add(rig, new THREE.TorusGeometry(0.295, 0.016, 8, seg), darkMetal, [0, y, 0], [Math.PI / 2, 0, 0]).scale.set(1, 0.82, 1));
  const hips = add(rig, lathe([[0, -1.0], [0.24, -0.99], [0.35, -0.93], [0.36, -0.86], [0, -0.85]]), white);
  hips.scale.z = 0.8;

  // ── Brazos: hombrera blanca con luz, brazo gris, codo, antebrazo blindado y mano.
  const HAND = -0.8;
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.6, -0.2, 0);
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
