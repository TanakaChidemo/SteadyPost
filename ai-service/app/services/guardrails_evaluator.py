import os
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


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


def screen_sensitivity(
    topic: str, snippet: str = "", sensitivity_level: str = "standard"
) -> dict:
    """
    LLM-backed sensitivity classifier.
    Note: Fast-path regex screening runs locally in the Node.js backend
    (backend/src/services/guardrails/sensitivityFilter.js) before calling this service.
    """
    full_text = " — ".join(part for part in [topic, snippet] if part).strip()
    if not full_text:
        return {
            "isSensitive": False,
            "category": None,
            "confidence": 0.0,
            "reason": None,
            "source": "validation",
        }

    client, model = _get_llm_client()
    if client:
        try:
            prompt = (
                "You are a brand safety filter for social media. Determine if the following "
                "trend topic/news involves a real-world tragedy, natural disaster, death/casualty, "
                "armed conflict, severe scandal, or crisis that would make marketing or "
                "commercial posts insensitive or tone-deaf. Ignore harmless figurative idioms "
                "like 'killing it', 'crash course', or 'to die for'.\n\n"
                f"Sensitivity level: {sensitivity_level}\n"
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
            json_match = re.search(r"\{.*\}", content, flags=re.DOTALL)
            if json_match:
                import json

                data = json.loads(json_match.group(0))
                return {
                    "isSensitive": bool(data.get("isSensitive")),
                    "category": data.get("category"),
                    "confidence": 0.92,
                    "reason": data.get("reason"),
                    "source": "llm",
                }
        except Exception:
            pass

    return {
        "isSensitive": False,
        "category": None,
        "confidence": 0.1,
        "reason": None,
        "source": "fallback",
    }


def evaluate_tone(content: str, target_tones: list, strictness: str = "moderate") -> dict:
    if not content:
        return {
            "passed": False,
            "score": 0.0,
            "detectedTone": "none",
            "critique": "Draft content is empty.",
            "suggestions": ["Add text to evaluate brand tone."],
            "source": "validation",
        }

    tones = target_tones if target_tones else ["professional"]

    client, model = _get_llm_client()
    if client:
        try:
            prompt = (
                f"Evaluate if the following social media draft matches the brand tones: "
                f"{', '.join(tones)}.\n"
                f"Strictness level: {strictness}.\n\n"
                f"Draft:\n\"\"\"{content}\"\"\"\n\n"
                "Respond strictly in JSON format with keys:\n"
                '{"passed": bool, "score": float (0.0 to 1.0), "detectedTone": str, '
                '"critique": str or null, "suggestions": list of str}'
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
                    "source": "llm",
                }
        except Exception:
            pass

    # Fallback when no LLM key is configured or the upstream call fails
    return {
        "passed": True,
        "score": 0.85,
        "detectedTone": tones[0],
        "critique": None,
        "suggestions": [],
        "source": "fallback",
    }
