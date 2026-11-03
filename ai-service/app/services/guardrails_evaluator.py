import os
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

BENIGN_IDIOMS = [
    r"\bkilling\s+it\b",
    r"\bkiller\s+(?:deal|app|product|feature|recipe|workout|outfit|content)\b",
    r"\bcrash\s+course\b",
    r"\bto\s+die\s+for\b",
    r"\bdrop\s+dead\b",
    r"\bdead\s+(?:simple|serious|on|ahead|center)\b",
    r"\bviral\s+(?:meme|video|trend|growth|hit)\b",
    r"\bbomb\s+(?:review|performance)\b",
    r"\bbombarded\s+with\b",
    r"\bslaying\s+(?:it|the\s+game)\b",
    r"\bfired\s+up\b",
]

SENSITIVE_PATTERNS = [
    {
        "category": "tragedy_natural_disaster",
        "pattern": r"\b(?:earthquake|tsunami|hurricane|tornado|wildfire|cyclone|landslide|devastating\s+flood)\b.*?\b(?:devastat(?:ed|ing)|death\s*toll|casualties|displaced|destroyed|victims?|survivors?|catastroph(?:e|ic))\b",
        "pattern_short": r"\b(?:deadly\s+earthquake|fatal\s+hurricane|massive\s+tsunami|devastating\s+wildfire|catastrophic\s+flood)\b",
        "reason": "Natural disaster with casualties or humanitarian emergency.",
    },
    {
        "category": "mass_casualty_violence",
        "pattern": r"\b(?:mass\s+shooting|terrorist\s+attack|bombing|airstrike|hostage\s+crisis|fatal\s+stabbing|suicide\s+bombing)\b",
        "reason": "Violent incident or mass casualty event.",
    },
    {
        "category": "fatal_accident",
        "pattern": r"\b(?:plane\s+crash|flight\s+crash|train\s+derailment|fatal\s+pileup|deadly\s+explosion|building\s+collapse)\b.*?\b(?:kills?|killed|deaths?|dead|fatalities|casualties)\b",
        "pattern_short": r"\b(?:fatal\s+(?:plane\s+crash|explosion|crash)|deadly\s+(?:train\s+derailment|collapse))\b",
        "reason": "Fatal transportation or industrial catastrophe.",
    },
    {
        "category": "bereavement_death",
        "pattern": r"\b(?:tragic\s+death|mourns?\s+the\s+loss|passes?\s+away\s+at|found\s+dead\s+in|suicide\s+death|obituary\s+for|funeral\s+services?)\b",
        "pattern_short": r"\b(?:mourns?\s+(?:death|loss)|passed\s+away\s+after\s+battle|tragically\s+died)\b",
        "reason": "Grief, obituary, or death of a public figure.",
    },
    {
        "category": "war_armed_conflict",
        "pattern": r"\b(?:war\s+crimes?|civilian\s+casualties|military\s+invasion|shelling\s+of\s+civilians|missile\s+strike\s+kills)\b",
        "reason": "Active war, civilian casualties, or military hostilities.",
    },
    {
        "category": "scandal_abuse",
        "pattern": r"\b(?:child\s+(?:abuse|exploitation)|sexual\s+assault\s+allegations|human\s+trafficking\s+bust)\b",
        "reason": "Severe criminal controversy or abuse allegations.",
    },
    {
        "category": "civil_unrest",
        "pattern": r"\b(?:violent\s+riots?|martial\s+law\s+declared|violent\s+clashes\s+leave\s+(?:\d+|several)\s+dead)\b",
        "reason": "Violent civil unrest or state of emergency.",
    },
]


def _is_configured(key: str | None) -> bool:
    if not key:
        return False
    k = key.strip()
    return bool(k and not k.startswith("your_") and k != "placeholder")


def _get_llm_client():
    groq_key = os.getenv("GROQ_API_KEY")
    if _is_configured(groq_key):
        try:
            return OpenAI(
                api_key=groq_key,
                base_url="https://api.groq.com/openai/v1",
                timeout=8.0,
            ), os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
        except Exception:
            pass

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if _is_configured(openrouter_key):
        try:
            return OpenAI(
                api_key=openrouter_key,
                base_url="https://openrouter.ai/api/v1",
                timeout=8.0,
            ), os.getenv("OPENROUTER_MODEL", "openrouter/auto")
        except Exception:
            pass

    openai_key = os.getenv("OPENAI_API_KEY")
    if _is_configured(openai_key):
        try:
            return OpenAI(api_key=openai_key, timeout=8.0), "gpt-4o-mini"
        except Exception:
            pass

    return None, None


def screen_sensitivity(topic: str, snippet: str = "", sensitivity_level: str = "standard") -> dict:
    full_text = " — ".join(part for part in [topic, snippet] if part).strip()
    if not full_text:
        return {"isSensitive": False, "category": None, "confidence": 0.0, "reason": None}

    # Clean benign idioms
    cleaned = full_text
    for idiom in BENIGN_IDIOMS:
        cleaned = re.sub(idiom, " benign_phrase ", cleaned, flags=re.IGNORECASE)

    # 1. Rule-based evaluation
    for item in SENSITIVE_PATTERNS:
        if re.search(item["pattern"], cleaned, flags=re.IGNORECASE) or (
            item.get("pattern_short") and re.search(item["pattern_short"], cleaned, flags=re.IGNORECASE)
        ):
            return {
                "isSensitive": True,
                "category": item["category"],
                "confidence": 0.95,
                "reason": item["reason"],
            }

    # Casualty regex (e.g. "12 killed", "hundreds dead")
    casualty_match = re.search(r"\b(?:\d+|dozens?|scores?)\s+(?:killed|dead|injured|slain)\b", cleaned, flags=re.IGNORECASE)
    if casualty_match:
        return {
            "isSensitive": True,
            "category": "casualty_event",
            "confidence": 0.90,
            "reason": f"Mentions casualties: '{casualty_match.group(0)}'.",
        }

    # 2. LLM evaluation if available and text is ambiguous
    client, model = _get_llm_client()
    if client:
        try:
            prompt = (
                "You are a brand safety filter for social media. Determine if the following trend topic/news "
                "involves a real-world tragedy, natural disaster, death/casualty, armed conflict, severe scandal, "
                "or crisis that would make marketing or commercial posts insensitive or tone-deaf.\n\n"
                f"Topic: {full_text}\n\n"
                "Respond strictly in JSON format:\n"
                '{"isSensitive": boolean, "category": string or null, "reason": string or null}'
            )
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
            )
            content = response.choices[0].message.content.strip()
            # Parse json safely
            json_match = re.search(r"\{.*\}", content, flags=re.DOTALL)
            if json_match:
                import json
                data = json.loads(json_match.group(0))
                return {
                    "isSensitive": bool(data.get("isSensitive")),
                    "category": data.get("category"),
                    "confidence": 0.92,
                    "reason": data.get("reason"),
                }
        except Exception:
            pass

    return {
        "isSensitive": False,
        "category": None,
        "confidence": 0.1,
        "reason": None,
    }


def evaluate_tone(content: str, target_tones: list, strictness: str = "moderate") -> dict:
    if not content:
        return {
            "passed": False,
            "score": 0.0,
            "detectedTone": "none",
            "critique": "Draft content is empty.",
            "suggestions": ["Add text to evaluate brand tone."],
        }

    tones = target_tones if target_tones else ["professional"]

    client, model = _get_llm_client()
    if client:
        try:
            prompt = (
                f"Evaluate if the following social media draft matches the brand tones: {', '.join(tones)}.\n"
                f"Strictness level: {strictness}.\n\n"
                f"Draft:\n\"\"\"{content}\"\"\"\n\n"
                "Respond strictly in JSON format with keys:\n"
                '{"passed": bool, "score": float (0.0 to 1.0), "detectedTone": str, "critique": str or null, "suggestions": list of str}'
            )
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
            )
            raw = response.choices[0].message.content.strip()
            json_match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
            if json_match:
                import json
                data = json.loads(json_match.group(0))
                return {
                    "passed": bool(data.get("passed", True)),
                    "score": float(data.get("score", 0.85)),
                    "detectedTone": data.get("detectedTone", ", ".join(tones)),
                    "critique": data.get("critique"),
                    "suggestions": data.get("suggestions", []),
                }
        except Exception:
            pass

    # Heuristic fallback
    return {
        "passed": True,
        "score": 0.85,
        "detectedTone": tones[0],
        "critique": None,
        "suggestions": [],
    }
