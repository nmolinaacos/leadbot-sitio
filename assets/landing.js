// Leadbot: "Radiografía de un mensaje".
// Una línea de tiempo (GSAP) atada al scroll recorre una escena fija: el scroll
// es la cámara. El tiempo de la línea va de 0 a FIN; render() calcula todo lo
// que depende del instante exacto (luz del haz, reloj, enfoque de las
// estaciones, escritura, contadores), así que avanzar o retroceder siempre deja
// la escena coherente. Lenis suaviza el scroll y da la velocidad para el
// desenfoque de movimiento.
// Sin la clase .pelicula (sin JS o con "reducir movimiento") no corre nada de
// esto: queda la historia en texto.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const limitar = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const tramo = (t, a, b) => limitar((t - a) / (b - a));
const suave = (p) => p * p * (3 - 2 * p);

/* ---------- Planes: mensual o anual (funciona siempre) ---------- */
$$('[data-periodo]').forEach((boton) => {
  boton.addEventListener('click', () => {
    const periodo = boton.dataset.periodo;
    $$('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
    $$('[data-mensual]').forEach((el) => { el.textContent = el.dataset[periodo]; });
  });
});

if (document.documentElement.classList.contains('pelicula') && window.gsap && window.ScrollTrigger && window.Lenis) {
  pelicula();
} else {
  document.documentElement.classList.remove('pelicula');
}

function pelicula() {
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Scroll suave ---------- */
  const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const destino = $(a.getAttribute('href'));
    if (!destino) return;
    e.preventDefault();
    lenis.scrollTo(destino, { offset: -20, duration: 1.4 });
  }));

  /* ---------- Grano de lente: una textura de ruido generada una vez ---------- */
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 160;
  const cx = lienzo.getContext('2d');
  const img = cx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  $('.grano').style.backgroundImage = `url(${lienzo.toDataURL()})`;

  /* ---------- Piezas ---------- */
  const camara = $('.camara');
  const telefono = $('.telefono');
  const mensaje = $('.mensaje');
  const tokens = $$('.tk', mensaje);
  const claves = tokens.filter((t) => t.classList.contains('clave'));
  const rellenos = tokens.filter((t) => !t.classList.contains('clave'));
  const haz = $('.haz');
  const medidorNum = $('.medidor-num');
  const medidorBarra = $('.medidor-barra i');
  const riel = $('.riel');
  const estaciones = $$('.estacion');
  const fichas = $$('.ficha');
  const sello = $('.ficha.elegida em');
  const celdas = $$('.matriz .c');
  const objetivo = $('.matriz .objetivo');
  const ruta = $('.mapa .ruta');
  const largoRuta = ruta.getTotalLength();
  const reglas = $$('.reglas li');
  const cursorMs = $('.regla-cursor');
  const barrido = $('#barrido-blur');
  const respuestaTexto = $('.respuesta-texto');
  const oResp = $('.o-resp');
  const muro = $('.muro');
  const nocheNum = $('.noche-num');
  const hud = $('.hud');
  const hudEscena = $('.hud-escena');
  const hudReloj = $('.hud-reloj');
  const hudRelojNum = $('.hud-reloj b');
  const hudBarra = $('.hud-barra i');
  const saltar = $('.saltar');

  ruta.style.strokeDasharray = largoRuta;
  ruta.style.strokeDashoffset = largoRuta;

  /* ---------- Muro de la noche ---------- */
  const columnas = () => (innerWidth <= 760 ? 12 : 22);
  let celdasMuro = [];
  let celdaHumana = null;
  function armarMuro() {
    muro.style.setProperty('--cols', columnas());
    muro.innerHTML = '';
    const cols = columnas();
    const filas = 16;
    const lista = [];
    for (let i = 0; i < cols * filas; i++) {
      const c = document.createElement('i');
      muro.append(c);
      lista.push(c);
    }
    // La que te pasa a ti queda a la vista, cerca del centro y hacia el frente.
    celdaHumana = lista[(filas - 5) * cols + Math.floor(cols * 0.62)];
    // Las demás se encienden en un orden mezclado, no de corrido.
    celdasMuro = lista.filter((c) => c !== celdaHumana)
      .map((c) => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  }
  armarMuro();

  /* ---------- La respuesta, en segmentos (los resaltados son datos) ---------- */
  const RESPUESTA = [
    ['¡Hola Laura! Sí, los ', false], ['Aura en blanco talla 38', true], [' están disponibles. Cuestan ', false],
    ['$289.000', true], [' y el envío a ', false], ['Pasto', true], [' sale en ', false], ['$18.000', true],
    ['; llegan en 3 a 4 días hábiles. ¿Te envío el link de pago?', false],
  ];
  const largoRespuesta = RESPUESTA.reduce((n, [s]) => n + s.length, 0);
  let escritos = -1;
  function escribir(n) {
    if (n === escritos) return;
    escritos = n;
    let quedan = n;
    let html = '';
    for (const [s, marca] of RESPUESTA) {
      if (quedan <= 0) break;
      const parte = s.slice(0, quedan);
      quedan -= parte.length;
      html += marca ? `<mark>${parte}</mark>` : parte;
    }
    respuestaTexto.innerHTML = `${html}<span class="cursor"></span>`;
  }

  /* ---------- Posiciones de las palabras flotando (fracciones de la pantalla) ---------- */
  // [x, y, profundidad]; las de relleno se van al fondo.
  const NUBE = [
    [0.06, 0.2, -420], [0.3, 0.13, -520], [0.08, 0.36, 90], [0.52, 0.28, 10],
    [0.66, 0.17, -460], [0.2, 0.56, 50], [0.6, 0.48, -30], [0.34, 0.7, 70],
  ];
  const nubeX = (i, el) => () => {
    const W = innerWidth;
    const izquierda = (W - mensaje.offsetWidth) / 2 + el.offsetLeft;
    return Math.min(NUBE[i][0] * W, W * 0.95 - el.offsetWidth) - izquierda;
  };
  const nubeY = (i, el) => () => {
    const H = innerHeight;
    const arriba = H / 2 - mensaje.offsetHeight / 2 + el.offsetTop;
    return NUBE[i][1] * H - arriba;
  };

  /* ---------- Riel: posición que centra cada estación ---------- */
  const centroEst = (i) => estaciones[i].offsetLeft + estaciones[i].offsetWidth / 2;
  const xEstacion = (i) => innerWidth / 2 - centroEst(i);

  /* ---------- Línea de tiempo ---------- */
  const FIN = 114;
  const movil = () => innerWidth <= 760;
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
  gsap.set(mensaje, { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.3 });
  // Filtro con las mismas funciones de principio a fin (si no, GSAP arranca el brillo en 0).
  gsap.set(telefono, { filter: 'blur(0px) brightness(1)' });
  gsap.set(['.respuesta', '.opcion'], { yPercent: -50, y: 0 });
  gsap.set('.final-3s', { yPercent: movil() ? 0 : -50, y: 0 });
  gsap.set($$('.ramas path'), { attr: { pathLength: 1 }, strokeDasharray: 1, strokeDashoffset: 1 });

  // 0 → 1 · El titular se va; la notificación se desprende del celular y crece
  // hasta llenar la pantalla. El celular se queda atrás y se apaga.
  const noti = $('.noti');
  const tamMensaje = () => parseFloat(getComputedStyle(mensaje).fontSize);
  const desdeNoti = () => {
    const r = noti.getBoundingClientRect();
    return { x: r.left + r.width / 2 - innerWidth / 2, y: r.top + r.height / 2 - innerHeight / 2 };
  };
  tl.to('.titular-intro', { y: -60, opacity: 0, duration: 4, ease: 'power1.in' }, 4)
    // Relevo: la notificación se despega y se funde con el mensaje grande, que
    // arranca del mismo tamaño y lugar.
    .to(noti, { scale: 1.25, y: () => -innerHeight * 0.03, opacity: 0, filter: 'blur(3px)', duration: 1.6, ease: 'power2.in' }, 6)
    .fromTo(mensaje,
      { x: () => desdeNoti().x, y: () => desdeNoti().y, scale: () => noti.offsetWidth / (mensaje.offsetWidth + tamMensaje() * 0.9), '--burbuja': 1 },
      { x: 0, y: 0, scale: 1, duration: 9, ease: 'power3.inOut', immediateRender: false }, 6)
    .fromTo(mensaje, { opacity: 0 }, { opacity: 1, duration: 1.4, ease: 'none', immediateRender: false }, 6.2)
    .to(mensaje, { '--burbuja': 0, duration: 3, ease: 'power1.in' }, 12.5)
    .to(telefono, { scale: 0.9, filter: 'blur(10px) brightness(0.55)', opacity: 0, duration: 8, ease: 'power2.inOut' }, 6.5);

  // 2 · Las palabras se separan en profundidad; el haz las lee.
  tokens.forEach((el, i) => {
    const relleno = rellenos.includes(el);
    tl.to(el, {
      x: nubeX(i, el), y: nubeY(i, el), z: NUBE[i][2],
      filter: relleno ? 'blur(5px)' : 'blur(0px)', opacity: relleno ? 0.32 : 1,
      duration: 4.5, ease: 'power3.inOut',
    }, 16 + i * 0.18);
  });
  tl.to(haz, { opacity: 1, duration: 1 }, 18.5)
    .to('.medidor', { opacity: 1, duration: 1.2 }, 20)
    .fromTo('.lateral-leer', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.5 }, 21)
    .to('.lateral-leer', { opacity: 0, y: -10, duration: 1 }, 28.5)
    .to(haz, { opacity: 0, duration: 1 }, 28.2);

  // 2 → 3 · La cámara gira a la derecha y entra al riel.
  tl.to(rellenos, { opacity: 0, duration: 1.2 }, 28.6)
    .to(claves, {
      x: (i, el) => gsap.getProperty(el, 'x') - innerWidth * 0.35,
      rotationY: 50, opacity: 0, filter: 'blur(8px)', duration: 2.2, ease: 'power2.in', stagger: 0.1,
    }, 29.2)
    .to('.medidor', { opacity: 0, duration: 1 }, 30)
    .to('.riel-caja', { opacity: 1, duration: 2 }, 31.4)
    .fromTo(riel, { x: () => xEstacion(0) + innerWidth * 0.6 }, { x: () => xEstacion(0), duration: 3, ease: 'power2.out' }, 31)
    // Viaja, se detiene en cada estación mientras trabaja, y sigue.
    .to(riel, { x: () => xEstacion(1), duration: 2.6, ease: 'power2.inOut' }, 39.4)
    .to(riel, { x: () => xEstacion(2), duration: 2.4, ease: 'power2.inOut' }, 48.4)
    .to(riel, { x: () => xEstacion(3), duration: 2.4, ease: 'power2.inOut' }, 56.8)
    .to(riel, { x: () => xEstacion(3) - innerWidth * 0.6, duration: 3, ease: 'power2.in' }, 66)
    .to('.riel-caja', { opacity: 0, duration: 2 }, 67.5);

  // 4 · La decisión.
  tl.to('.decision', { opacity: 1, duration: 1.5 }, 69)
    .to('.ramas .tronco', { strokeDashoffset: 0, duration: 1.2, ease: 'none' }, 70)
    .to('.ramas .rama-l', { strokeDashoffset: 0, duration: 1.4, ease: 'power1.out', stagger: 0.15 }, 71)
    .fromTo('.opcion', { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 1.2, stagger: 0.2 }, 71.5)
    .fromTo('.lateral-decidir', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.2 }, 72)
    .to(['.o-dato', '.o-hum'], { opacity: 0.3, filter: 'blur(4px)', scale: 0.94, x: -20, duration: 2, ease: 'power2.out' }, 74.5)
    .to(['.r-dato', '.r-hum'], { opacity: 0.2, duration: 2 }, 74.5)
    .to('.o-resp', { scale: 1.05, duration: 2, ease: 'power2.out' }, 74.5)
    .to('.decision', { opacity: 0, duration: 1.5 }, 77.5);

  // 5 · Los datos vuelan a la burbuja mientras se escribe la respuesta.
  tl.to('.redaccion', { opacity: 1, duration: 1.2 }, 78)
    .fromTo('.dato', { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 1.4, stagger: 0.25, ease: 'back.out(1.4)' }, 78.2)
    .fromTo('.respuesta', { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.6, ease: 'power3.out' }, 78.6)
    .fromTo('.lateral-escribir', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.2 }, 79.5)
    .to('.dato', {
      x: () => innerWidth * (movil() ? 0.2 : 0.42), y: (i) => (1 - i) * 30, scale: 0.6, opacity: 0,
      duration: 2.2, stagger: 0.9, ease: 'power3.in',
    }, 81.5)
    .to('.lateral-escribir', { opacity: 0, duration: 1 }, 87);

  // 6 · Zoom hacia atrás: volvemos al celular.
  tl.to('.respuesta', { scale: 0.22, x: () => -innerWidth * 0.18, opacity: 0, filter: 'blur(6px)', duration: 3, ease: 'power3.in' }, 88)
    .to('.redaccion', { opacity: 0, duration: 1 }, 90)
    .set('.tel-hora', { opacity: 0 }, 88)
    .fromTo(telefono, { scale: 3.4, filter: 'blur(14px) brightness(1)', opacity: 0 },
      { scale: 1, filter: 'blur(0px) brightness(1)', opacity: 1, duration: 4, ease: 'power3.out', immediateRender: false }, 88.5)
    .to('.tb.bot', { opacity: 1, duration: 0.8 }, 91)
    .fromTo('.tb.cli', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8, immediateRender: false }, 92.5)
    .fromTo('.tb.pedido', { opacity: 0, y: 14, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 1, ease: 'back.out(1.6)', immediateRender: false }, 94)
    .fromTo('.final-3s', { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 1.4, immediateRender: false }, 93.5);

  // 7 · La cámara se aleja: una conversación entre cientos.
  tl.to('.final-3s', { opacity: 0, duration: 1 }, 96.5)
    .to(telefono, { scale: 0.18, y: () => innerHeight * 0.05, opacity: 0, duration: 3.5, ease: 'power3.in' }, 96.5)
    .to('.noche', { opacity: 1, duration: 2 }, 97.5)
    .fromTo(muro, { rotationX: 66, z: -200 }, { rotationX: 54, z: 40, duration: 15, ease: 'none', immediateRender: false }, 97.5)
    .fromTo('.globo-humano', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.5, immediateRender: false }, 107.5)
    .to({}, { duration: FIN - 109 }, 109);

  /* ---------- Lo que depende del instante exacto ---------- */
  // Tiempo de la línea → segundos reales del bot (la cámara lenta).
  const TIEMPOS = [[0, 0], [6, 0], [16, 0.12], [30, 0.41], [32, 0.62], [68, 2.14], [78, 2.38], [88, 2.95], [96, 3.1]];
  const reloj = (t) => {
    for (let i = 1; i < TIEMPOS.length; i++) {
      const [t1, s1] = TIEMPOS[i];
      const [t0, s0] = TIEMPOS[i - 1];
      if (t <= t1) return s0 + (s1 - s0) * tramo(t, t0, t1);
    }
    return 3.1;
  };
  const ESCENAS = [
    [0, 'Recibido · WhatsApp · 11:47 p. m.'], [16, 'Lectura · intención'], [31, 'Razonamiento · 1/4 catálogo'],
    [42, 'Razonamiento · 2/4 existencias'], [50, 'Razonamiento · 3/4 envío'], [58, 'Razonamiento · 4/4 reglas'],
    [69, 'Decisión'], [78, 'Redactando · tu tono'], [88, 'Enviado ✓✓'], [96.5, 'Toda la noche · 11:00 p. m. → 7:00 a. m.'],
  ];
  let escenaActual = '';
  const formato = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const ABANICO = [[-38, -62, -9], [0, -78, 0], [38, -62, 9]];

  let velocidad = 0; // px/s del scroll, suavizada
  function render() {
    const t = tl.time();
    const W = innerWidth;

    // HUD
    const nombre = ESCENAS.filter(([d]) => t >= d).pop()[1];
    if (nombre !== escenaActual) { escenaActual = nombre; hudEscena.textContent = nombre; }
    hudRelojNum.textContent = formato.format(reloj(t));
    hudReloj.classList.toggle('listo', t >= 95);
    hudBarra.style.transform = `scaleX(${(t / FIN).toFixed(4)})`;

    // 2 · El haz barre la pantalla y enciende las palabras clave que toca.
    const xHaz = W * (-0.05 + 1.1 * tramo(t, 19, 28));
    haz.style.transform = `translateX(${xHaz.toFixed(1)}px)`;
    if (t > 15 && t < 31) {
      for (const el of claves) {
        const r = el.getBoundingClientRect();
        const centro = r.left + r.width / 2;
        const pasado = t > 19 && xHaz >= r.left;
        const cerca = 1 - limitar(Math.abs(xHaz - centro) / (r.width / 2 + 120));
        el.style.setProperty('--etq', pasado ? 1 : 0);
        el.style.setProperty('--luz', pasado ? Math.max(0.35, cerca).toFixed(3) : 0);
      }
    }
    const confianza = 0.94 * suave(tramo(t, 21, 28));
    medidorNum.textContent = confianza.toFixed(2).replace('.', ',');
    medidorBarra.style.transform = `scaleX(${confianza.toFixed(4)})`;

    // 3 · Profundidad de campo por distancia al centro y curvatura del riel.
    if (t > 30 && t < 70) {
      const x = gsap.getProperty(riel, 'x');
      estaciones.forEach((est, i) => {
        const d = (x + centroEst(i) - W / 2) / W;
        const ad = Math.abs(d);
        est.style.filter = `blur(${Math.min(10, ad * 18).toFixed(2)}px)`;
        est.style.opacity = (1 - Math.min(0.7, ad * 0.9)).toFixed(3);
        est.style.transform = `perspective(1200px) rotateY(${limitar(-d * 40, -28, 28).toFixed(2)}deg) scale(${(1 - Math.min(0.14, ad * 0.18)).toFixed(3)})`;
      });
      cursorMs.style.left = `${(tramo(t, 32, 68) * 100).toFixed(2)}%`;
    }

    // 3a · Las fichas se abren en abanico; la que coincide pasa al frente.
    const pA = suave(tramo(t, 34.5, 39.5));
    ABANICO.forEach(([x, y, r], i) => {
      fichas[i].style.transform = `translate(${x * pA}%, ${y * pA}%) rotate(${r * pA}deg) scale(${1 - 0.08 * pA})`;
      fichas[i].style.opacity = 1 - 0.45 * pA;
    });
    fichas[3].style.transform = `translateY(${pA * 46}%) scale(${0.92 + 0.12 * pA})`;
    fichas[3].style.zIndex = pA > 0.5 ? 5 : 0;
    sello.style.opacity = tramo(t, 39, 40.5);

    // 3b · Se recorren las celdas y se enciende blanco · talla 38.
    celdas.forEach((c, i) => {
      c.style.opacity = c === objetivo ? 1 : (0.35 + 0.65 * tramo(t, 42.5 + i * 0.35, 43.5 + i * 0.35)).toFixed(3);
    });
    objetivo.style.setProperty('--brillo', suave(tramo(t, 46.5, 48.5)).toFixed(3));

    // 3c · Se dibuja la ruta.
    ruta.style.strokeDashoffset = (largoRuta * (1 - suave(tramo(t, 51, 56.5)))).toFixed(1);

    // 3d · Las reglas se marcan una a una.
    reglas.forEach((li, i) => li.style.setProperty('--ok', suave(tramo(t, 59 + i * 1.6, 60 + i * 1.6)).toFixed(3)));
    oResp.classList.toggle('elegida', t >= 75);

    // 5 · La respuesta se escribe con el scroll (y se borra si regresas).
    escribir(Math.round(largoRespuesta * tramo(t, 80, 87.2)));

    // 7 · Las decisiones de la noche se encienden; una es para ti.
    const pNoche = tramo(t, 98.5, 110);
    const encendidas = Math.round(celdasMuro.length * 0.6 * pNoche);
    celdasMuro.forEach((c, i) => {
      const clase = i < encendidas ? 'on' : '';
      if (c.className !== clase) c.className = clase;
    });
    celdaHumana.className = t >= 106 ? 'hum' : '';
    nocheNum.textContent = Math.round(214 * pNoche);

    // Desenfoque de movimiento del riel según la velocidad del scroll.
    const enRiel = t > 31 && t < 69;
    // (el filtro se quita en reposo: anula el vidrio esmerilado de las estaciones)
    const desenfoque = enRiel ? Math.min(14, velocidad / 260) : 0;
    barrido.setAttribute('stdDeviation', `${desenfoque.toFixed(2)} 0`);
    riel.style.filter = desenfoque > 0.3 ? 'url(#barrido)' : 'none';
  }
  tl.eventCallback('onUpdate', render);

  // La velocidad sube con el scroll y decae suave entre eventos.
  lenis.on('scroll', (e) => { velocidad = Math.max(velocidad * 0.6, Math.abs(e.velocity) * 60); });
  gsap.ticker.add(() => {
    if (velocidad < 0.5) return;
    velocidad *= 0.9;
    render();
  });

  /* ---------- El scroll mueve la línea de tiempo ---------- */
  ScrollTrigger.create({
    trigger: '.pelicula-pista',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.5,
    animation: tl,
    invalidateOnRefresh: true,
    onLeave: () => { hud.classList.add('fuera'); saltar.classList.add('fuera'); },
    onEnterBack: () => { hud.classList.remove('fuera'); saltar.classList.remove('fuera'); },
  });

  /* ---------- Parallax de cámara con el mouse o el giroscopio ---------- */
  const giroX = gsap.quickTo(camara, 'rotationY', { duration: 1.2, ease: 'power3.out' });
  const giroY = gsap.quickTo(camara, 'rotationX', { duration: 1.2, ease: 'power3.out' });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    giroX((e.clientX / innerWidth - 0.5) * 4);
    giroY(-(e.clientY / innerHeight - 0.5) * 3);
  });
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    giroX(limitar(e.gamma / 12, -3, 3));
    giroY(limitar((e.beta - 45) / -18, -2.5, 2.5));
  });

  let columnasActuales = columnas();
  addEventListener('resize', () => {
    if (columnas() !== columnasActuales) { columnasActuales = columnas(); armarMuro(); }
  });

  render();
  if (new URLSearchParams(location.search).has('depurar')) window.__pelicula = { tl, render, FIN };

  // Para revisar escenas sueltas: ?t=40 salta a ese instante de la película.
  const tPrueba = parseFloat(new URLSearchParams(location.search).get('t'));
  if (!Number.isNaN(tPrueba)) {
    requestAnimationFrame(() => {
      const st = ScrollTrigger.getAll()[0];
      const y = st.start + (st.end - st.start) * (tPrueba / FIN);
      lenis.scrollTo(y, { immediate: true });
    });
  }
}
