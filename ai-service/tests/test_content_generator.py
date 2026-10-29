from app.services.content_generator import (
    _clamp_to_platform_limit,
    _build_fallback_variant,
    generate_variants,
)


def test_clamp_to_platform_limit_twitter():
    long_text = "A" * 350
    clamped = _clamp_to_platform_limit(long_text, "twitter")
    assert len(clamped) <= 280
    assert clamped.endswith("...")


def test_build_fallback_variant_content():
    idea = "Fresh sourdough every morning, baked in Harare"

    tw = _build_fallback_variant("twitter", idea, "casual")
    assert "Fresh sourdough" in tw
    assert len(tw) <= 280

    li = _build_fallback_variant("linkedin", idea, "professional")
    assert "Fresh sourdough" in li
    assert "2026" not in li
    assert "modern execution" not in li

    ig = _build_fallback_variant("instagram", idea, "casual")
    assert "Fresh sourdough" in ig
    assert "#CreatorEconomy" not in ig
    assert "#Every" not in ig

    fb = _build_fallback_variant("facebook", idea, "casual")
    assert "Fresh sourdough" in fb


def test_generate_variants_fallback_labels():
    idea = "Fresh sourdough every morning"
    result = generate_variants(
        idea=idea,
        channels=["instagram", "facebook"],
        tone="casual",
    )
    assert result["idea"] == idea
    assert len(result["variants"]) == 2
    for v in result["variants"]:
        assert v["provider"] in ("groq", "openrouter", "gemini", "openai", "template")
        if v["provider"] == "template":
            assert v["model"] == "template-fallback"
        assert v["channel"] in ("instagram", "facebook")


def test_generate_variants_channel_filtering_and_deduplication():
    idea = "Community garden project"
    result = generate_variants(
        idea=idea,
        channels=["facebook", "facebook", "tiktok", "myspace", "instagram"],
    )
    channels_returned = [v["channel"] for v in result["variants"]]
    assert channels_returned == ["facebook", "instagram"]


def test_generate_variants_unknown_channels_only():
    import pytest

    with pytest.raises(ValueError, match="None of the requested channels are supported"):
        generate_variants(idea="Test idea", channels=["tiktok", "myspace"])


def test_generate_variants_default_channels():
    result = generate_variants(idea="Default channel test", channels=None)
    channels_returned = [v["channel"] for v in result["variants"]]
    assert channels_returned == ["instagram", "facebook"]
