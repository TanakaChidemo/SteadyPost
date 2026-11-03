from flask import Blueprint, jsonify, request
from app.services.guardrails_evaluator import evaluate_tone, screen_sensitivity

guardrails_bp = Blueprint("guardrails", __name__)


@guardrails_bp.post("/tone")
def tone_endpoint():
    data = request.get_json(silent=True) or {}
    content = data.get("content", "")
    target_tones = data.get("targetTones", [])
    strictness = data.get("strictness", "moderate")

    result = evaluate_tone(content, target_tones, strictness)
    return jsonify(result)


@guardrails_bp.post("/sensitivity")
def sensitivity_endpoint():
    data = request.get_json(silent=True) or {}
    topic = data.get("topic", "")
    snippet = data.get("snippet", "")
    sensitivity_level = data.get("sensitivityLevel", "standard")

    result = screen_sensitivity(topic, snippet, sensitivity_level)
    return jsonify(result)
