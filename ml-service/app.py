import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
import pandas as pd
import spacy

app = FastAPI(title="Argus ML Anomaly & NLP Intelligence Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FEATURE_NAMES = [
    "amount_zscore",
    "velocity",
    "is_new_counterparty",
    "hour_of_day",
    "amount_to_balance_ratio"
]

# 1. Load ML Model
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
if not os.path.exists(MODEL_PATH):
    MODEL_PATH = "model.joblib"

try:
    model = joblib.load(MODEL_PATH)
    print(f"Loaded ML model successfully from {MODEL_PATH}")
except Exception as e:
    print(f"Warning: Failed to load model from {MODEL_PATH}: {e}")
    model = None

# 2. Load spaCy NLP Pipeline
try:
    nlp = spacy.load("en_core_web_sm")
    print("Loaded spaCy 'en_core_web_sm' successfully.")
except Exception as e:
    print(f"Warning: Could not load spaCy en_core_web_sm: {e}")
    nlp = None

# Vague / evasive terminology
VAGUE_TERMS = {
    "misc",
    "consulting fee",
    "as discussed",
    "gift",
    "urgent settlement",
    "personal loan",
    "private agreement",
    "discretionary",
    "advance payment",
    "services",
    "transfer"
}

@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "service": "Argus ML & NLP Intelligence Service",
        "model_loaded": model is not None,
        "nlp_loaded": nlp is not None
    }

@app.post("/score")
def score(features: dict):
    if model is None:
        raise HTTPException(status_code=500, detail="ML model artifact not loaded")
    
    try:
        row = {
            "amount_zscore": float(features.get("amount_zscore", 0.0)),
            "velocity": float(features.get("velocity", 0.0)),
            "is_new_counterparty": float(features.get("is_new_counterparty", 1.0)),
            "hour_of_day": float(features.get("hour_of_day", 12.0)),
            "amount_to_balance_ratio": float(features.get("amount_to_balance_ratio", 0.1))
        }

        X = pd.DataFrame([row], columns=FEATURE_NAMES)
        raw_score = model.decision_function(X)[0]
        risk_score = float(np.clip(1.0 - (raw_score + 0.5), 0.0, 1.0))

        return {
            "risk_score": round(risk_score, 4),
            "raw_decision_score": round(float(raw_score), 4),
            "flagged": risk_score >= 0.70
        }
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Error scoring features: {str(err)}")

@app.post("/parse-narration")
def parse_narration(payload: dict):
    text = payload.get("narration", "")
    entities = []
    if nlp is not None and text:
        doc = nlp(text)
        entities = [ent.text for ent in doc.ents]
    
    text_lower = text.lower() if text else ""
    is_vague = any(term in text_lower for term in VAGUE_TERMS)
    
    return {
        "entities": entities,
        "is_vague_language": is_vague
    }
