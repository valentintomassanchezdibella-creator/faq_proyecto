const API = 'https://preguntas-frecuentes-castores.onrender.com';
let historial = [];
let esperando = false;
let sesionBloqueada = false;

function hora() {
  return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensaje();
  }
}

function scrollAbajo() {
  const area = document.getElementById('chat-area');
  setTimeout(() => area.scrollTop = area.scrollHeight, 50);
}

function ocultarWelcome() {
  const w = document.getElementById('welcome-card');
  if (w) w.remove();
}

function quitarTyping() {
  const t = document.getElementById('typing');
  if (t) t.remove();
}

function agregarError(msg) {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = 'msg bot';
  div.innerHTML = `
    <div class="msg-avatar"><img src="./imagenes/bot-normal.jpeg" class="avatar-img" alt="bot"></div>
    <div class="msg-wrap">
      <div class="error-badge">⚠️ ${msg}</div>
      <div class="msg-time">${hora()}</div>
    </div>
  `;
  area.appendChild(div);
  scrollAbajo();
}

function bloquearSesion() {
  sesionBloqueada = true;

  const input  = document.getElementById('input-msg');
  const boton  = document.getElementById('btn-send');

  input.disabled    = true;
  input.placeholder = 'Sesión bloqueada por reiteradas consultas inapropiadas.';
  boton.disabled    = true;
  boton.style.opacity = '0.4';
  boton.style.cursor  = 'not-allowed';
}

async function enviarMensaje() {
  if (esperando || sesionBloqueada) return;

  const input = document.getElementById('input-msg');
  const texto = input.value.trim();
  if (!texto) return;

  ocultarWelcome();
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;
  esperando = true;

  agregarMensaje(texto, 'user');
  historial.push({ role: 'user', content: texto });
  agregarTyping();

  try {
    const res = await fetch(`${API}/chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: texto, historial: historial.slice(-6) })
    });

    quitarTyping();

    if (!res.ok) {
      const err = await res.json();
      agregarError(err.detail || 'Error al procesar la consulta.');
      document.getElementById('btn-send').disabled = false;
      esperando = false;
      if (window.innerWidth > 768) {
        input.focus();
      }
      return;
    }

    const data = await res.json();

    if (data.bloqueo_sesion) {
      bloquearSesion();
    }

    // Crear burbuja
    const area = document.getElementById('chat-area');
    const div = document.createElement('div');
    div.className = 'msg bot';
    div.innerHTML = `
      <div class="msg-avatar">
        <img src="./imagenes/bot-hablando.jpeg" class="avatar-img" alt="bot">
      </div>
      <div class="msg-wrap">
        <div class="${data.respondida ? 'msg-bubble' : 'msg-bubble no-answer'}">
          <span class="texto-visible"></span><span class="texto-fantasma" style="opacity:0">${data.respuesta}</span>
        </div>
        <div class="msg-time">${hora()}</div>
      </div>
    `;
    area.appendChild(div);
    scrollAbajo();

    const visible  = div.querySelector('.texto-visible');
    const fantasma = div.querySelector('.texto-fantasma');
    const avatar   = div.querySelector('.avatar-img');
    const avatarWrap = div.querySelector('.msg-avatar');
    const palabras = data.respuesta.split(' ');

    let iPalabra = 0;
    let iLetra   = 0;

    function escribir() {
      if (iPalabra >= palabras.length) {
        avatarWrap.classList.remove('hablando');
        avatarWrap.classList.remove('pensando');
        fantasma.textContent = '';
        avatar.src = './imagenes/bot-normal.jpeg';

        return;
      }

      const palabraActual = palabras[iPalabra];

      if (iLetra <= palabraActual.length) {
        avatar.src = './imagenes/bot-hablando.jpeg';
        avatarWrap.classList.remove('pensando');
        avatarWrap.classList.add('hablando');

        const anteriores = iPalabra > 0
          ? palabras.slice(0, iPalabra).join(' ') + ' '
          : '';
        visible.textContent = anteriores + palabraActual.slice(0, iLetra);

        const restoActual = palabraActual.slice(iLetra);
        const siguientes  = iPalabra + 1 < palabras.length
          ? ' ' + palabras.slice(iPalabra + 1).join(' ')
          : '';
        fantasma.textContent = restoActual + siguientes;

        iLetra++;
        setTimeout(escribir, 30);
      } else {
        avatar.src = './imagenes/bot-normal.jpeg';
        avatarWrap.classList.remove('hablando');
        iPalabra++;
        iLetra = 0;
        setTimeout(escribir, 60);
      }
    }

    escribir();
    historial.push({ role: 'assistant', content: data.respuesta });

  } catch (e) {
    quitarTyping();
    agregarError('No se pudo conectar con el servidor. Intentá de nuevo en un momento.');
  }

  if (!sesionBloqueada) {
    document.getElementById('btn-send').disabled = false;
    if (window.innerWidth > 768) {
      document.getElementById('input-msg').focus();
    }
  }
  esperando = false;
}

function agregarTyping() {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing';
  div.innerHTML = `
    <div class="msg-avatar pensando">
      <img src="./imagenes/bot-pensando.jpeg" class="avatar-img" alt="bot">
    </div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  area.appendChild(div);
  scrollAbajo();
}

function agregarMensaje(texto, tipo, sinRespuesta = false) {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = `msg ${tipo}`;

  const avatar = tipo === 'bot'
    ? `<div class="msg-avatar"><img src="./imagenes/bot-normal.jpeg" class="avatar-img" alt="bot"></div>`
    : `<div class="msg-avatar"><img src="./imagenes/usuario.jpeg" class="avatar-img" alt="vos"></div>`;

  const bubbleClass = sinRespuesta ? 'msg-bubble no-answer' : 'msg-bubble';

  function escaparHTML(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  div.innerHTML = `
    ${avatar}
    <div class="msg-wrap">
      <div class="${bubbleClass}">${escaparHTML(texto)}</div>
      <div class="msg-time">${hora()}</div>
    </div>
  `;
  area.appendChild(div);
  scrollAbajo();
  return div;
}

function enviarSugerencia(texto) {
  if (sesionBloqueada) return;
  document.getElementById('input-msg').value = texto;
  enviarMensaje();
}

function limpiarChat() {
  location.reload();
}

async function loadContador() {
  try {
    const res = await fetch(`${API}/metricas/publico`);
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('contador-consultas');
    if (el && data.total > 0) {
      el.textContent = `Ya respondí ${data.total.toLocaleString('es-AR')} consultas 🎓`;
    }
  } catch (e) {}
}

loadContador();