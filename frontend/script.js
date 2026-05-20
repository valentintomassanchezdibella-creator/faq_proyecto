const API = 'http://127.0.0.1:8000';
let historial = [];
let esperando = false;

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

function agregarMensaje(texto, tipo, sinRespuesta = false) {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = `msg ${tipo}`;

  const avatar = tipo === 'bot'
    ? `<div class="msg-avatar">🏫</div>`
    : `<div class="msg-avatar">Vos</div>`;

  const bubbleClass = sinRespuesta ? 'msg-bubble no-answer' : 'msg-bubble';

  div.innerHTML = `
    ${avatar}
    <div class="msg-wrap">
      <div class="${bubbleClass}">${texto}</div>
      <div class="msg-time">${hora()}</div>
    </div>
  `;
  area.appendChild(div);
  scrollAbajo();
  return div;
}

function agregarTyping() {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing';
  div.innerHTML = `
    <div class="msg-avatar bot-avatar" style="width:30px;height:30px;background:var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;margin-bottom:2px">🏫</div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  area.appendChild(div);
  scrollAbajo();
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
    <div class="msg-avatar">🏫</div>
    <div class="msg-wrap">
      <div class="error-badge">⚠️ ${msg}</div>
      <div class="msg-time">${hora()}</div>
    </div>
  `;
  area.appendChild(div);
  scrollAbajo();
}

async function enviarMensaje() {
  if (esperando) return;
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
    } else {
      const data = await res.json();
      agregarMensaje(data.respuesta, 'bot', !data.respondida);
      historial.push({ role: 'assistant', content: data.respuesta });
    }
  } catch (e) {
    quitarTyping();
    agregarError('No se pudo conectar con el servidor. Intentá de nuevo en un momento.');
  }

  document.getElementById('btn-send').disabled = false;
  esperando = false;
  input.focus();
}

function enviarSugerencia(texto) {
  document.getElementById('input-msg').value = texto;
  enviarMensaje();
}

function limpiarChat() {
  historial = [];
  const area = document.getElementById('chat-area');
  area.innerHTML = `
    <div class="welcome-card" id="welcome-card">
      <div class="welcome-icon">🎓</div>
      <h2>¡Hola! Soy el asistente virtual de la E.E.S.T. N°6 Chacabuco</h2>
      <p>Podés preguntarme sobre horarios, inscripciones, especialidades, contactos y más información de la escuela.</p>
      <div class="welcome-chips">
        <button class="welcome-chip" onclick="enviarSugerencia('¿Cuál es el horario de la escuela?')">⏰ Horarios</button>
        <button class="welcome-chip" onclick="enviarSugerencia('¿Cómo me inscribo?')">📝 Inscripción</button>
        <button class="welcome-chip" onclick="enviarSugerencia('¿Qué especialidades tiene la escuela?')">⚙️ Especialidades</button>
        <button class="welcome-chip" onclick="enviarSugerencia('¿Cómo contacto a la escuela?')">📞 Contacto</button>
      </div>
    </div>
  `;
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