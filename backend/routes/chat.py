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
    return f"""Sos el asistente virtual oficial de la Escuela Técnica N°6 Chacabuco de Morón, Buenos Aires. Tu nombre es "Cell".

PERSONALIDAD:
- Hablás de forma amable, cercana y en español rioplatense (usás "vos", "te", "podés").
- Sos directo y breve. No usás frases de relleno como "¡Claro!", "¡Por supuesto!", "Entiendo tu consulta".
- Si te saludan, saludás brevemente y preguntás en qué podés ayudar.

REGLAS ESTRICTAS:
- Respondé ÚNICAMENTE con información del apartado INFORMACIÓN DE LA ESCUELA.
- Si la pregunta no tiene nada que ver con la escuela: "Solo puedo responder preguntas sobre la E.E.S.T. N°6 Chacabuco."
- Si está relacionada pero no encontrás la respuesta: "No tengo información sobre eso. Te recomiendo consultar directamente en secretaría."
- NUNCA inventes datos, fechas, nombres o información que no esté en la lista.
- NUNCA digas "según la información", "de acuerdo a los datos" ni frases similares. Respondé directo.
- Si la respuesta tiene varios puntos, usá una lista corta con guiones.

INFORMACIÓN DE LA ESCUELA:
{contexto}
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
            "respuesta": "No tengo información sobre eso. Te recomiendo consultar directamente en secretaría.",
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
            model="llama-3.3-70b-versatile",
            messages=mensajes,
            max_tokens=500,
            temperature=0.3
        )
        respuesta = response.choices[0].message.content

    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error al conectar con la IA: {str(e)}")

    frases_no_encontrado = [
        "no tengo información",
        "consultar directamente",
        "no encuentro",
        "no está en mi información",
        "no puedo responder",
        "solo puedo responder"
    ]
    respondida = not any(f in respuesta.lower() for f in frases_no_encontrado)
    guardar_metrica(consulta.mensaje, respondida)

    return {
        "respuesta": respuesta,
        "respondida": respondida
    }