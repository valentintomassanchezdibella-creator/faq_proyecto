from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from config import supabase
from routes.auth import verificar_token, solo_admin

router = APIRouter()


# --- Modelos ---
class Pregunta(BaseModel):
    pregunta: str
    respuesta: str
    categoria: Optional[str] = None
    activa: Optional[bool] = True

class PreguntaActualizar(BaseModel):
    pregunta: Optional[str] = None
    respuesta: Optional[str] = None
    categoria: Optional[str] = None
    activa: Optional[bool] = None


# --- Endpoints públicos (el chatbot los usa) ---

@router.get("/")
def listar_preguntas(
    pagina: int = 1,
    por_pagina: int = 10,
    categoria: Optional[str] = None,
    incluir_inactivas: bool = False
):
    offset = (pagina - 1) * por_pagina

    query = supabase.table("preguntas").select("*", count="exact").order("id")

    if not incluir_inactivas:
        query = query.eq("activa", True)

    if categoria:
        query = query.eq("categoria", categoria)

    result = query.range(offset, offset + por_pagina - 1).execute()

    return {
        "datos": result.data,
        "total": result.count,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "paginas_totales": -(-result.count // por_pagina)
    }

@router.get("/categorias")
def listar_categorias():
    result = supabase.table("preguntas").select("categoria").eq("activa", True).execute()
    categorias = list(set(r["categoria"] for r in result.data if r["categoria"]))
    return categorias


@router.get("/{id}")
def obtener_pregunta(id: int):
    result = supabase.table("preguntas").select("*").eq("id", id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    return result.data[0]


# --- Endpoints protegidos (solo usuarios autenticados) ---

@router.post("/", dependencies=[Depends(verificar_token)])
def crear_pregunta(pregunta: Pregunta):
    # Verificar que no exista una pregunta igual
    existente = supabase.table("preguntas").select("id").eq("pregunta", pregunta.pregunta).execute()
    if existente.data:
        raise HTTPException(status_code=400, detail="Ya existe una pregunta igual")

    result = supabase.table("preguntas").insert(pregunta.model_dump()).execute()
    return result.data[0]


@router.put("/{id}", dependencies=[Depends(verificar_token)])
def actualizar_pregunta(id: int, datos: PreguntaActualizar):
    # Verificar que existe
    existente = supabase.table("preguntas").select("id").eq("id", id).execute()
    if not existente.data:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    # Filtrar solo los campos que se mandaron
    campos = {k: v for k, v in datos.model_dump().items() if v is not None}
    if not campos:
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    result = supabase.table("preguntas").update(campos).eq("id", id).execute()
    return result.data[0]


@router.delete("/{id}", dependencies=[Depends(solo_admin)])
def eliminar_pregunta(id: int):
    existente = supabase.table("preguntas").select("id").eq("id", id).execute()
    if not existente.data:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    supabase.table("preguntas").delete().eq("id", id).execute()
    return {"mensaje": "Pregunta eliminada"}


@router.patch("/{id}/toggle", dependencies=[Depends(verificar_token)])
def toggle_activa(id: int):
    existente = supabase.table("preguntas").select("*").eq("id", id).execute()
    if not existente.data:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    estado_actual = existente.data[0]["activa"]
    result = supabase.table("preguntas").update({"activa": not estado_actual}).eq("id", id).execute()
    return {"activa": result.data[0]["activa"]}