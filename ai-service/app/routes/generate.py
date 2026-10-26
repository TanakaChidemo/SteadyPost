from flask import Blueprint, request, jsonify

from app.services.content_generator import (
    generate_caption,
    generate_hashtags,
    repurpose_content,
    generate_variants,
)

generate_bp = Blueprint("generate", __name__)


@generate_bp.post("/caption")
def caption():
    payload = request.get_json(silent=True) or {}
    topic = payload.get("topic")
    platform = payload.get("platform", "instagram")
    tone = payload.get("tone", "casual")

    if not topic:
        return jsonify(error="`topic` is required"), 400

    result = generate_caption(topic=topic, platform=platform, tone=tone)
    return jsonify(result)


@generate_bp.post("/hashtags")
def hashtags():
    payload = request.get_json(silent=True) or {}
    content = payload.get("content")
    platform = payload.get("platform", "instagram")
    max_tags = payload.get("maxTags", 10)

    if not content:
        return jsonify(error="`content` is required"), 400

    result = generate_hashtags(content=content, platform=platform, max_tags=int(max_tags))
    return jsonify(result)


@generate_bp.post("/repurpose")
def repurpose():
    payload = request.get_json(silent=True) or {}
    content = payload.get("content")
    source_platform = payload.get("sourcePlatform", "twitter")
    target_platforms = payload.get("targetPlatforms", [])

    if not content or not target_platforms:
        return jsonify(error="`content` and `targetPlatforms` are required"), 400

    result = repurpose_content(
        content=content,
        source_platform=source_platform,
        target_platforms=target_platforms,
    )
    return jsonify(result)


@generate_bp.post("/variants")
def variants():
    payload = request.get_json(silent=True) or {}
    idea = payload.get("idea") or payload.get("topic")
    channels = payload.get("channels", ["twitter", "linkedin", "instagram", "facebook"])
    tone = payload.get("tone", "casual")
    business_profile = payload.get("businessProfile")
    source_post = payload.get("sourcePost")

    if not idea:
        return jsonify(error="`idea` or `topic` is required"), 400

    result = generate_variants(
        idea=idea,
        channels=channels,
        tone=tone,
        business_profile=business_profile,
        source_post=source_post,
    )
    return jsonify(result)
