from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from config import supabase, GROQ_API_KEY
from datetime import datetime

router = APIRouter()
client = Groq(api_key=GROQ_API_KEY)


# --- Modelo ---
class Consulta(BaseModel):
    mensaje: str
    historial: list = []  # lista de {"role": "user"/"assistant", "content": "..."}


# --- Funciones internas ---
def obtener_contexto():
    """Trae todas las preguntas activas de Supabase para armar el contexto"""
    result = supabase.table("preguntas").select("pregunta, respuesta, categoria").eq("activa", True).execute()
    
    if not result.data:
        return "No hay información disponible."
    
    contexto = ""
    for item in result.data:
        contexto += f"P: {item['pregunta']}\nR: {item['respuesta']}\n\n"
    
    return contexto


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
    return f"""Sos un asistente virtual de la Escuela Técnica N°6 Chacabuco de Morón.
Tu única función es responder preguntas sobre la escuela usando la información provista.

REGLAS ESTRICTAS:
- Solo respondés preguntas relacionadas con la escuela.
- Si la pregunta no está relacionada con la escuela, respondés: "Solo puedo responder preguntas sobre la Escuela Técnica N°6 Chacabuco."
- Si no encontrás la respuesta en la información provista, respondés: "No tengo información sobre eso. Te recomiendo consultar en secretaría."
- No inventés información. No hables de temas externos.
- Respondé siempre en español, de forma clara y breve.

INFORMACIÓN DE LA ESCUELA:
{contexto}
"""


# --- Endpoint ---
@router.post("/")
def chat(consulta: Consulta):
    if not consulta.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")

    if len(consulta.mensaje) > 500:
        raise HTTPException(status_code=400, detail="El mensaje es demasiado largo")

    # Armar contexto desde Supabase
    contexto = obtener_contexto()
    system_prompt = construir_system_prompt(contexto)

    # Armar mensajes con historial
    mensajes = [{"role": "system", "content": system_prompt}]
    
    # Incluir historial previo (máximo últimos 6 mensajes para no pasarse del contexto)
    if consulta.historial:
        mensajes += consulta.historial[-6:]
    
    mensajes.append({"role": "user", "content": consulta.mensaje})

    # Llamar a Groq
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=mensajes,
            max_tokens=500,
            temperature=0.3  # bajo para que no "alucine"
        )
        respuesta = response.choices[0].message.content

    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error al conectar con la IA: {str(e)}")

    # Determinar si respondió o dijo que no sabe
    respondida = "no tengo información" not in respuesta.lower() and "secretaría" not in respuesta.lower()
    guardar_metrica(consulta.mensaje, respondida)

    return {
        "respuesta": respuesta,
        "respondida": respondida
    }