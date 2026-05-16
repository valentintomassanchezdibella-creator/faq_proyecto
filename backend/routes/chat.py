from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from config import supabase, GROQ_API_KEY
from datetime import datetime
import unicodedata

router = APIRouter()
client = Groq(api_key=GROQ_API_KEY)


# --- Modelo ---
class Consulta(BaseModel):
    mensaje: str
    historial: list = []  # lista de {"role": "user"/"assistant", "content": "..."}


# --- Funciones internas ---

def guardar_metrica(consulta: str, respondida: bool):
    """Guarda la consulta en la tabla métricas"""
    try:
        supabase.table("metricas").insert({
            "consulta": consulta,
            "respondida": respondida,
            "fecha": datetime.utcnow().isoformat()
        }).execute()
    except Exception:
        pass  # Si falla la métrica no rompemos el chat


def construir_system_prompt(contexto: str) -> str:
    return f"""Sos el asistente virtual oficial de la Escuela Técnica N°6 Chacabuco de Morón, Buenos Aires.

COMPORTAMIENTO:
- Respondé ÚNICAMENTE usando la información del apartado INFORMACIÓN DE LA ESCUELA.
- Si la pregunta no está relacionada con la escuela, respondé exactamente: "Solo puedo responder preguntas sobre la Escuela Técnica N°6 Chacabuco."
- Si la pregunta está relacionada con la escuela pero NO encontrás la respuesta en la información provista, respondé exactamente: "No tengo información sobre eso. Te recomiendo consultar directamente en secretaría."
- NUNCA inventes, supongas ni completes información que no esté en la lista.
- NUNCA respondas con información parcial si no estás seguro.
- Respondé siempre en español, de forma clara, amable y breve.
- Si la pregunta es un saludo, presentate brevemente y preguntá en qué podés ayudar.
- Si encontrás la respuesta, respondé directo sin decir "según la información" ni frases similares.

INFORMACIÓN DE LA ESCUELA:
{contexto}
"""


def normalizar(texto: str) -> str:
    texto = texto.lower()
    texto = unicodedata.normalize('NFD', texto)
    texto = ''.join(c for c in texto if unicodedata.category(c) != 'Mn')
    return texto

def buscar_pregunta_relevante(consulta: str, preguntas: list) -> bool:
    consulta_norm = normalizar(consulta)
    palabras = [p for p in consulta_norm.split() if len(p) > 3]
    if not palabras:
        return True
    for item in preguntas:
        texto = normalizar(item["pregunta"] + " " + item["respuesta"])
        if any(palabra in texto for palabra in palabras):
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
            model="llama-3.1-8b-instant",
            messages=mensajes,
            max_tokens=500,
            temperature=0.1
        )
        respuesta = response.choices[0].message.content

    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error al conectar con la IA: {str(e)}")

    frases_no_encontrado = [
        "no tengo información",
        "consultar directamente",
        "no encuentro",
        "no está en mi información",
        "no puedo responder"
    ]
    respondida = not any(f in respuesta.lower() for f in frases_no_encontrado)
    guardar_metrica(consulta.mensaje, respondida)

    return {
        "respuesta": respuesta,
        "respondida": respondida
    }