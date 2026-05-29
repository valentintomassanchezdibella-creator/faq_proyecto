# 🏫 Bot FAQ — E.E.S.T. N°6 Chacabuco

Bot de preguntas frecuentes con IA para la Escuela Técnica N°6 Chacabuco de Morón, Buenos Aires.

## 🔗 Links

- **Chatbot público:** https://preguntas-frecuentes-castores.netlify.app
- **Panel administrativo:** https://preguntas-frecuentes-castores.netlify.app/admin/
- **API (Render):** https://preguntas-frecuentes-castores.onrender.com/docs

---

## 🛠 Stack

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI (Python) |
| Base de datos | PostgreSQL (Supabase) |
| IA | LLaMA 3.3 70B (Groq API) |
| Frontend | HTML / CSS / JS |
| Deploy Backend | Render |
| Deploy Frontend | Netlify |

---

## 📁 Estructura

```
faq_proyecto/
├── backend/
│   ├── main.py              # Punto de entrada FastAPI
│   ├── config.py            # Variables de entorno y Supabase client
│   ├── requirements.txt
│   └── routes/
│       ├── auth.py          # Login, JWT, usuarios
│       ├── preguntas.py     # CRUD preguntas
│       ├── chat.py          # Integración Groq IA
│       └── metricas.py      # Estadísticas de uso
└── frontend/
    ├── index.html           # Chatbot público
    ├── estilos.css
    ├── script.js
    ├── imagenes/            # Avatares del bot
    └── admin/
        ├── index.html       # Panel administrativo
        ├── estilos.css
        └── script.js
```

---

## ⚙️ Instalación local

### 1. Clonar el repositorio

```bash
git clone https://github.com/valentintomassanchezdibella-creator/faq_proyecto.git
cd faq_proyecto
```

### 2. Configurar el backend

```bash
cd backend
pip install -r requirements.txt
```

Crear archivo `.env`:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=tu_service_role_key
GROQ_API_KEY=tu_groq_key
SECRET_KEY=tu_secret_key_random
```

### 3. Correr el servidor

```bash
python -m uvicorn main:app --reload
```

El backend queda en `http://localhost:8000`. Documentación de la API en `http://localhost:8000/docs`.

### 4. Correr el frontend

```bash
cd frontend
python -m http.server 5500
```

Abrir `http://localhost:5500` en el navegador.

---

## 🗄 Base de datos

Ejecutar en el SQL Editor de Supabase:

```sql
CREATE TABLE preguntas (
  id SERIAL PRIMARY KEY,
  pregunta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  categoria VARCHAR(100),
  activa BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE metricas (
  id SERIAL PRIMARY KEY,
  consulta TEXT NOT NULL,
  respondida BOOLEAN DEFAULT false,
  fecha TIMESTAMP DEFAULT NOW()
);

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  nombre TEXT,
  rol VARCHAR(20) DEFAULT 'user',
  creado_en TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Deploy

### Backend (Render)
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Variables de entorno: las 4 del `.env`

### Frontend (Netlify)
- Subir la carpeta `frontend/` desde el panel de Netlify
- Actualizar `const API` en los HTML con la URL de Render

---

## 📋 Endpoints principales

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | /auth/login | No | Login usuario/password |
| GET | /preguntas/ | No | Listar preguntas activas |
| POST | /preguntas/ | Sí | Crear pregunta |
| PUT | /preguntas/{id} | Sí | Editar pregunta |
| DELETE | /preguntas/{id} | Admin | Eliminar pregunta |
| POST | /chat/ | No | Enviar mensaje al bot |
| GET | /metricas/ | Admin | Ver estadísticas |

---

## 👤 Roles

| Rol | Permisos |
|-----|---------|
| Visitante | Solo chatbot público |
| Usuario | Panel + crear/editar preguntas + métricas |
| Admin | Todo lo anterior + eliminar preguntas + gestionar usuarios |

---

## 📄 Documentación

Ver carpeta `/docs` del repositorio:
- `Manual_Tecnico.docx` — Arquitectura, API y deploy
- `Manual_Usuario.docx` — Guía de uso del sistema

---

*Proyecto desarrollado para la materia de Implementación de Sitios Web Dinámicos — Prof. Pedro Javier Salinas*
