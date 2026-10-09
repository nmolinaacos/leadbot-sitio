// Leadbot: página de inicio en vidrio claro.
// - Hero: video de fondo (se pausa con el botón o con movimiento reducido) y
//   una conversación que fluye sola, canal por canal, en burbujas de vidrio.
// - "Cómo funciona": el celular avanza por los tres pasos cuando entra en pantalla.
// - El resto aparece con un fundido suave al hacer scroll.
// Sin JavaScript todo queda visible (las clases de animación dependen de .js).

const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// ?depurar: ignora si la pestaña está oculta (para revisar con el navegador automatizado).
const depurar = new URLSearchParams(location.search).has('depurar');
const oculta = () => document.hidden && !depurar;

/* ---------- Video del hero ---------- */
const video = document.querySelector('.hero-video');
const pausa = document.querySelector('.pausa');

function ponerPausa(pausado) {
  pausa.setAttribute('aria-pressed', String(pausado));
  pausa.setAttribute('aria-label', pausado ? 'Reproducir el video de fondo' : 'Pausar el video de fondo');
}

if (video) {
  // El usuario pausó (o pidió menos movimiento): no se reproduce solo.
  const pausadoPorUsuario = () => pausa.getAttribute('aria-pressed') === 'true';
  const intentar = () => { if (!pausadoPorUsuario()) video.play().catch(() => {}); };
  if (reducido) ponerPausa(true);
  else intentar();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) intentar(); });
  pausa.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      ponerPausa(false);
    } else {
      video.pause();
      ponerPausa(true);
    }
  });
  // No gastar batería reproduciendo un video que no se ve.
  new IntersectionObserver(([e]) => {
    if (pausadoPorUsuario()) return;
    if (e.isIntersecting) intentar();
    else video.pause();
  }).observe(video);
}

/* ---------- Conversación del hero ---------- */
const CONVERSACIONES = [
  {
    canal: 'whatsapp', nombre: 'WhatsApp', quien: 'Laura G.', hora: 'Domingo · 3:18 p. m.',
    mensajes: [
      ['cliente', 'Hola, ¿la silla Nova tiene envío a Medellín?'],
      ['bot', '¡Hola Laura! Sí, llega en 2 días hábiles y el envío es gratis. Cuesta $650.000.'],
      ['cliente', 'Perfecto, me la llevo 🙌'],
      ['bot', 'Listo. Te dejo el link de pago y apenas se confirme la despachamos.'],
      ['estado', 'Pedido #1042 · pagado'],
    ],
  },
  {
    canal: 'instagram', nombre: 'Instagram', quien: '@andres.dev', hora: 'Domingo · 3:26 p. m.',
    mensajes: [
      ['cliente', '¿Tienen teclados blancos?'],
      ['bot', 'Sí, el Kraken TKL en blanco está disponible a $289.000. Te envío las fotos 👇'],
      ['cliente', 'Uff, qué bonito. ¿Viene con switch rojo?'],
      ['bot', 'Sí, rojo lineal. ¿Te lo separo para envío a Bogotá?'],
      ['estado', 'Venta en curso'],
    ],
  },
  {
    canal: 'messenger', nombre: 'Messenger', quien: 'Carolina R.', hora: 'Domingo · 3:41 p. m.',
    mensajes: [
      ['cliente', 'Necesito factura a nombre de mi empresa, ¿se puede?'],
      ['bot', 'Claro. Le aviso a alguien del equipo para que te ayude con los datos de la factura.'],
      ['estado-alerta', 'Te avisamos a ti · cuando quieras'],
    ],
  },
];

const chat = document.querySelector('.hero-chat');
const hilo = chat?.querySelector('.chat-hilo');

function burbuja(tipo, texto) {
  const p = document.createElement('p');
  if (tipo.startsWith('estado')) {
    p.className = 'burbuja estado entra' + (tipo === 'estado-alerta' ? ' alerta' : '');
  } else {
    p.className = `burbuja ${tipo} entra`;
  }
  p.textContent = texto;
  return p;
}

function escribiendo() {
  const p = document.createElement('p');
  p.className = 'burbuja bot escribiendo entra';
  p.setAttribute('aria-hidden', 'true');
  p.innerHTML = '<span></span><span></span><span></span>';
  return p;
}

function ponerCabeza(c) {
  const canal = chat.querySelector('.chat-canal');
  canal.dataset.canal = c.canal;
  canal.textContent = c.nombre;
  chat.querySelector('.chat-quien').textContent = c.quien;
  chat.querySelector('.chat-hora').textContent = c.hora;
}

let heroVisible = true;
async function cuandoVisible() {
  while (!heroVisible || oculta()) await espera(400);
}

// Movimiento natural: los tiempos dependen del largo del mensaje y varían un
// poco cada vez, como cuando alguien escribe de verdad.
const variar = (ms) => ms * (0.85 + Math.random() * 0.3);
const SUAVE = 'cubic-bezier(0.22, 1, 0.36, 1)';

// Cambia el contenido de un hilo y desliza lo que ya estaba a su nueva
// posición (FLIP), en vez de que salte de golpe.
// `extra`: otros elementos que se mueven con el hilo (la cabecera del chat).
function deslizar(contenedor, cambio, extra = []) {
  const antes = new Map([...contenedor.children, ...extra].map((el) => [el, el.getBoundingClientRect().top]));
  cambio();
  for (const el of [...contenedor.children, ...extra]) {
    const arriba = antes.get(el);
    if (arriba === undefined) continue;
    const dy = arriba - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 700, easing: SUAVE });
  }
}

async function reproducirChat() {
  const cabeza = chat.querySelector('.chat-cabeza');
  for (let i = 0; ; i = (i + 1) % CONVERSACIONES.length) {
    const c = CONVERSACIONES[i];
    ponerCabeza(c);
    hilo.replaceChildren();
    chat.classList.remove('sale');
    await espera(700);
    for (const [tipo, texto] of c.mensajes) {
      await cuandoVisible();
      const nueva = burbuja(tipo, texto);
      if (tipo === 'bot') {
        const dots = escribiendo();
        deslizar(hilo, () => hilo.append(dots), [cabeza]);
        await espera(variar(Math.min(2400, 700 + texto.length * 18)));
        // Los puntos se convierten en el mensaje: crece en su lugar.
        deslizar(hilo, () => dots.replaceWith(nueva), [cabeza]);
        await espera(variar(Math.min(2600, 1300 + texto.length * 12)));
      } else if (tipo === 'cliente') {
        deslizar(hilo, () => hilo.append(nueva), [cabeza]);
        // El bot "lee" antes de empezar a escribir.
        await espera(variar(Math.min(1600, 600 + texto.length * 10)));
      } else {
        await espera(400);
        deslizar(hilo, () => hilo.append(nueva), [cabeza]);
        await espera(1200);
      }
    }
    await espera(variar(2600));
    chat.classList.add('sale');
    await espera(800);
  }
}

if (chat && !reducido) {
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(chat);
  reproducirChat();
}

/* ---------- Aparición al hacer scroll ---------- */
const observarUnaVez = (el, alVer, opciones = { threshold: 0.2 }) => {
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        alVer(e.target);
        io.unobserve(e.target);
      }
    }
  }, opciones);
  io.observe(el);
};

document.querySelectorAll('.revela').forEach((el) => observarUnaVez(el, (t) => t.classList.add('visible'), { threshold: 0.15 }));

/* ---------- La noche: avisos y contador ---------- */
const avisos = document.querySelector('.avisos');
const contador = document.querySelector('.contador-num');
if (avisos) {
  observarUnaVez(avisos, () => {
    avisos.classList.add('visible');
    if (reducido) return;
    const total = avisos.children.length;
    for (let n = 0; n <= total; n++) setTimeout(() => { contador.textContent = n; }, n * 250);
  }, { threshold: 0.3 });
  if (!reducido) contador.textContent = '0';
}

/* ---------- Cómo funciona: el celular avanza por los pasos ---------- */
const telefono = document.querySelector('.telefono');
const pasos = [...document.querySelectorAll('.paso')];

const chatTelefono = telefono?.querySelector('.telefono-chat');

function mostrarPaso(n) {
  pasos.forEach((p, i) => p.classList.toggle('activo', i === n));
}

function verMensaje(m) {
  if (m.classList.contains('ver')) return;
  deslizar(chatTelefono, () => {
    m.classList.add('ver');
    if (!reducido) m.classList.add('entra');
  });
}

async function recorrerPasos() {
  for (let n = 0; n < pasos.length; n++) {
    mostrarPaso(n);
    for (const m of telefono.querySelectorAll(`[data-paso="${n}"]`)) {
      await espera(variar(m.classList.contains('cliente') ? 700 : 1300));
      verMensaje(m);
    }
    await espera(variar(1800));
  }
}

function mostrarHasta(n) {
  mostrarPaso(n);
  telefono.querySelectorAll('[data-paso]').forEach((m) => { if (Number(m.dataset.paso) <= n) verMensaje(m); });
}

if (telefono) {
  if (reducido) {
    mostrarHasta(pasos.length - 1);
  } else {
    observarUnaVez(telefono, recorrerPasos, { threshold: 0.4 });
  }
  pasos.forEach((p, i) => p.addEventListener('click', () => mostrarHasta(i)));
}

/* ---------- Planes: mensual o anual ---------- */
document.querySelectorAll('[data-periodo]').forEach((boton) => {
  boton.addEventListener('click', () => {
    const periodo = boton.dataset.periodo;
    document.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
    document.querySelectorAll('[data-mensual]').forEach((el) => { el.textContent = el.dataset[periodo]; });
  });
});
