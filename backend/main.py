import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, preguntas, chat, metricas

app = FastAPI(title="ChatBot Escolar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500"],  # después restringís a tu dominio
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,       prefix="/auth",       tags=["Auth"])
app.include_router(preguntas.router,  prefix="/preguntas",  tags=["Preguntas"])
app.include_router(chat.router,       prefix="/chat",       tags=["Chat"])
app.include_router(metricas.router,   prefix="/metricas",   tags=["Metricas"])

@app.get("/")
def root():
    return {"status": "ok"}