from fastapi import APIRouter, Depends
from config import supabase
from routes.auth import solo_admin

router = APIRouter()


@router.get("/", dependencies=[Depends(solo_admin)])
def obtener_metricas():
    result = supabase.table("metricas").select("*").execute()
    datos = result.data

    if not datos:
        return {
            "total_consultas": 0,
            "respondidas": 0,
            "sin_respuesta": 0,
            "tasa_respuesta": 0,
            "consultas_frecuentes": []
        }

    total = len(datos)
    respondidas = sum(1 for d in datos if d["respondida"])
    sin_respuesta = total - respondidas

    # Contar consultas repetidas
    conteo = {}
    for d in datos:
        consulta = d["consulta"].lower().strip()
        conteo[consulta] = conteo.get(consulta, 0) + 1

    # Top 10 más buscadas
    frecuentes = sorted(conteo.items(), key=lambda x: x[1], reverse=True)[:10]
    frecuentes = [{"consulta": k, "veces": v} for k, v in frecuentes]

    return {
        "total_consultas": total,
        "respondidas": respondidas,
        "sin_respuesta": sin_respuesta,
        "tasa_respuesta": round((respondidas / total) * 100, 1),
        "consultas_frecuentes": frecuentes
    }


@router.delete("/", dependencies=[Depends(solo_admin)])
def limpiar_metricas():
    supabase.table("metricas").delete().neq("id", 0).execute()
    return {"mensaje": "Métricas limpiadas"}