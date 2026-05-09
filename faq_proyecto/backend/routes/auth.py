from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from datetime import datetime, timedelta
from config import supabase, SECRET_KEY
from pydantic import BaseModel

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8


# --- Modelos ---
class TokenData(BaseModel):
    email: str
    rol: str


# --- Funciones internas ---
def crear_token(data: dict):
    payload = data.copy()
    payload["exp"] = datetime.now(datetime.timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verificar_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return TokenData(email=payload["email"], rol=payload["rol"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


def solo_admin(user: TokenData = Depends(verificar_token)):
    if user.rol != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol admin")
    return user


# --- Endpoints ---
@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    # Buscar usuario en Supabase
    result = supabase.table("usuarios").select("*").eq("email", form.username).execute()

    if not result.data:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    usuario = result.data[0]

    # Verificar password contra Supabase Auth
    try:
        auth_response = supabase.auth.sign_in_with_password({
            "email": form.username,
            "password": form.password
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    token = crear_token({"email": usuario["email"], "rol": usuario["rol"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "rol": usuario["rol"],
        "nombre": usuario.get("nombre", "")
    }


@router.get("/me")
def get_me(user: TokenData = Depends(verificar_token)):
    result = supabase.table("usuarios").select("*").eq("email", user.email).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return result.data[0]


@router.get("/usuarios", dependencies=[Depends(solo_admin)])
def listar_usuarios():
    result = supabase.table("usuarios").select("id, email, nombre, rol, creado_en").execute()
    return result.data


@router.post("/usuarios", dependencies=[Depends(solo_admin)])
def crear_usuario(email: str, password: str, nombre: str, rol: str = "user"):
    # Crear en Supabase Auth
    try:
        supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al crear usuario: {str(e)}")

    # Registrar en tabla usuarios
    result = supabase.table("usuarios").insert({
        "email": email,
        "nombre": nombre,
        "rol": rol
    }).execute()

    return result.data[0]


@router.delete("/usuarios/{email}", dependencies=[Depends(solo_admin)])
def eliminar_usuario(email: str):
    supabase.table("usuarios").delete().eq("email", email).execute()
    return {"mensaje": "Usuario eliminado"}