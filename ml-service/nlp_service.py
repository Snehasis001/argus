import spacy

# Load spaCy small English pipeline
try:
    nlp = spacy.load("en_core_web_sm")
    print("spaCy model 'en_core_web_sm' loaded successfully.")
except Exception as e:
    print(f"Warning: Could not load spacy en_core_web_sm: {e}")
    nlp = None

# Evasive / vague terms commonly observed in money laundering narratives
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

def analyze_narration(text: str):
    if not text:
        return {"entities": [], "is_vague_language": False}

    entities = []
    if nlp is not None:
        doc = nlp(text)
        entities = [ent.text for ent in doc.ents]

    text_lower = text.lower()
    is_vague = any(term in text_lower for term in VAGUE_TERMS)

    return {
        "entities": entities,
        "is_vague_language": is_vague
    }
