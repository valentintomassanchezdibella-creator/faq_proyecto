from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from config import supabase, GROQ_API_KEY
from datetime import datetime
from rapidfuzz import fuzz
import unicodedata
import re

router = APIRouter()
client = Groq(api_key=GROQ_API_KEY)


# --- Modelo ---
class Consulta(BaseModel):
    mensaje: str
    historial: list = []


# --- Funciones internas ---

def guardar_metrica(consulta: str, respondida: bool):
    try:
        supabase.table("metricas").insert({
            "consulta": consulta,
            "respondida": respondida,
            "fecha": datetime.utcnow().isoformat()
        }).execute()
    except Exception:
        pass



def construir_system_prompt(contexto: str) -> str:
    return f"""
Sos "Chaca-Chan", la asistente virtual oficial de la Escuela de Educación Secundaria Técnica N°6 Chacabuco de Morón, Buenos Aires.

Tu única función es responder consultas relacionadas con la escuela usando EXCLUSIVAMENTE la información del CONTEXTO.

========================
COMPORTAMIENTO
========================

- Respondé siempre en español.
- Usá un tono amable, natural y cercano.
- Sé breve y directa.
- Evitá frases innecesarias como:
  - "Claro"
  - "Por supuesto"
  - "Entiendo tu consulta"
  - "Según la información"

- Si el usuario saluda:
  - saludá brevemente
  - preguntá en qué podés ayudar

Ejemplo:
"Hola, ¿en qué puedo ayudarte?"

========================
REGLAS ESTRICTAS
========================

1. SOLO podés responder usando información del CONTEXTO.

2. NO inventes:
- fechas
- horarios
- teléfonos
- direcciones
- nombres
- especialidades
- eventos
- requisitos
- ni ningún dato faltante.

3. Si la pregunta NO tiene relación con la escuela, respondé EXACTAMENTE:
"Solo puedo responder preguntas sobre la E.E.S.T. N°6 Chacabuco."

4. Si la pregunta está relacionada con la escuela pero la respuesta NO aparece en el contexto, respondé EXACTAMENTE:
"No tengo información sobre eso. Te recomiendo consultar directamente en secretaría."

5. Si el contexto es insuficiente:
- NO deduzcas
- NO supongas
- NO completes información faltante.

6. Si la respuesta tiene varios puntos:
- usá listas con guiones
- evitá párrafos largos.

7. Respondé únicamente con la respuesta final.

========================
EJEMPLOS
========================

USUARIO:
¿Cuál es la dirección de la escuela?

ASISTENTE:
La escuela está ubicada en Av. Rivadavia 1234.

---

USUARIO:
¿Quién ganó el mundial 2022?

ASISTENTE:
Solo puedo responder preguntas sobre la E.E.S.T. N°6 Chacabuco.

---

USUARIO:
¿Cuándo empiezan las vacaciones?

ASISTENTE:
No tengo información sobre eso. Te recomiendo consultar directamente en secretaría.

========================
CONTEXTO
========================

<CONTEXTO>
{contexto if contexto.strip() else "No hay información disponible."}
</CONTEXTO>
"""


def normalizar(texto: str) -> str:
    texto = texto.lower()

    # Quitar tildes
    texto = unicodedata.normalize('NFD', texto)
    texto = ''.join(c for c in texto if unicodedata.category(c) != 'Mn')

    # Quitar signos especiales
    texto = re.sub(r'[^a-zA-Z0-9\s]', '', texto)

    # Quitar espacios dobles
    texto = re.sub(r'\s+', ' ', texto).strip()

    return texto


def buscar_pregunta_relevante(consulta: str, preguntas: list) -> bool:
    consulta_norm = normalizar(consulta)
    palabras = [p for p in consulta_norm.split() if len(p) > 3]

    if not palabras:
        return True

    for item in preguntas:
        texto = normalizar(item["pregunta"] + " " + item["respuesta"])
        if fuzz.partial_ratio(consulta_norm, texto) >= 60:
            return True

    return False


# --- Endpoint ---
@router.post("/")
def chat(consulta: Consulta):
    if not consulta.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")

    if len(consulta.mensaje) > 500:
        raise HTTPException(status_code=400, detail="El mensaje es demasiado largo")

    # Traer preguntas de Supabase
    result = supabase.table("preguntas").select("pregunta, respuesta, categoria").eq("activa", True).execute()
    preguntas = result.data

    # Verificar si hay algo relacionado antes de llamar a Groq
    if not buscar_pregunta_relevante(consulta.mensaje, preguntas):
        guardar_metrica(consulta.mensaje, False)
        return {
            "respuesta": "No tengo información sobre eso.",
            "respondida": False
        }

    # Armar contexto y system prompt
    contexto = "\n".join([f"P: {p['pregunta']}\nR: {p['respuesta']}" for p in preguntas])
    system_prompt = construir_system_prompt(contexto)

    # Armar mensajes con historial
    mensajes = [{"role": "system", "content": system_prompt}]
    if consulta.historial:
        mensajes += consulta.historial[-6:]
    mensajes.append({"role": "user", "content": consulta.mensaje})

    # Llamar a Groq
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=mensajes,
            max_tokens=500,
            temperature=0.1,
            top_p=0.9
        )
        respuesta = response.choices[0].message.content

    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error al conectar con la IA: {str(e)}")

    frases_no_encontrado = [
        "solo puedo responder"
    ]
    respondida = not any(f in respuesta.lower() for f in frases_no_encontrado)
    guardar_metrica(consulta.mensaje, respondida)

    return {
        "respuesta": respuesta,
        "respondida": respondida
    }