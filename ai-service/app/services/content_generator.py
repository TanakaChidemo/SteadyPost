import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

PLATFORM_CONSTRAINTS = {
    "twitter": "under 280 characters, punchy, no more than 2 hashtags",
    "instagram": "warm and visual, 1-3 short paragraphs, hashtag-friendly",
    "linkedin": "professional tone, value-driven, 2-4 short paragraphs",
    "facebook": "conversational, encourages comments, moderate length",
}


def _is_configured(key: str | None) -> bool:
    """Validate whether an API key has been set with a real value."""
    if not key:
        return False
    k = key.strip()
    return bool(k and not k.startswith("your_") and k != "placeholder")


def _get_active_model_and_client():
    """Return the first configured (client, model_name) tuple for secondary tasks."""
    groq_key = os.getenv("GROQ_API_KEY")
    if _is_configured(groq_key):
        try:
            model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
            client = OpenAI(
                api_key=groq_key,
                base_url="https://api.groq.com/openai/v1",
                timeout=12.0,
            )
            return client, model
        except Exception:
            pass

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if _is_configured(openrouter_key):
        try:
            model = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
            return OpenAI(
                api_key=openrouter_key,
                base_url="https://openrouter.ai/api/v1",
                default_headers={"HTTP-Referer": "http://localhost:3000", "X-Title": "SteadyPost"},
                timeout=12.0,
            ), model
        except Exception:
            pass

    gemini_key = os.getenv("GEMINI_API_KEY")
    if _is_configured(gemini_key):
        try:
            model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
            return OpenAI(
                api_key=gemini_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                timeout=12.0,
            ), model
        except Exception:
            pass

    openai_key = os.getenv("OPENAI_API_KEY")
    if _is_configured(openai_key):
        try:
            return OpenAI(api_key=openai_key, timeout=12.0), "gpt-4o-mini"
        except Exception:
            pass

    return None, None


def _generate_with_groq(messages: list) -> dict:
    key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    if not _is_configured(key):
        return {
            "provider": "groq",
            "label": "Groq",
            "model": model,
            "caption": None,
            "status": "not_configured",
            "error": "GROQ_API_KEY is not configured in ai-service/.env",
        }
    try:
        client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1", timeout=12.0)
        res = client.chat.completions.create(model=model, messages=messages, temperature=0.8)
        caption = res.choices[0].message.content.strip()
        return {
            "provider": "groq",
            "label": "Groq",
            "model": model,
            "caption": caption,
            "status": "success",
            "error": None,
        }
    except Exception as e:
        return {
            "provider": "groq",
            "label": "Groq",
            "model": model,
            "caption": None,
            "status": "error",
            "error": str(e),
        }


def _generate_with_openrouter(messages: list) -> dict:
    key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
    if not _is_configured(key):
        return {
            "provider": "openrouter",
            "label": "OpenRouter",
            "model": model,
            "caption": None,
            "status": "not_configured",
            "error": "OPENROUTER_API_KEY is not configured in ai-service/.env",
        }
    try:
        client = OpenAI(
            api_key=key,
            base_url="https://openrouter.ai/api/v1",
            default_headers={"HTTP-Referer": "http://localhost:3000", "X-Title": "SteadyPost"},
            timeout=14.0,
        )
        res = client.chat.completions.create(model=model, messages=messages, temperature=0.8)
        caption = res.choices[0].message.content.strip()
        return {
            "provider": "openrouter",
            "label": "OpenRouter",
            "model": model,
            "caption": caption,
            "status": "success",
            "error": None,
        }
    except Exception as e:
        return {
            "provider": "openrouter",
            "label": "OpenRouter",
            "model": model,
            "caption": None,
            "status": "error",
            "error": str(e),
        }


def _generate_with_gemini(messages: list) -> dict:
    key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    if not _is_configured(key):
        return {
            "provider": "gemini",
            "label": "Google Gemini",
            "model": model,
            "caption": None,
            "status": "not_configured",
            "error": "GEMINI_API_KEY is not configured in ai-service/.env",
        }
    try:
        client = OpenAI(
            api_key=key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            timeout=12.0,
        )
        res = client.chat.completions.create(model=model, messages=messages, temperature=0.8)
        caption = res.choices[0].message.content.strip()
        return {
            "provider": "gemini",
            "label": "Google Gemini",
            "model": model,
            "caption": caption,
            "status": "success",
            "error": None,
        }
    except Exception as e:
        return {
            "provider": "gemini",
            "label": "Google Gemini",
            "model": model,
            "caption": None,
            "status": "error",
            "error": str(e),
        }


def _local_template_caption(topic: str, platform: str = "instagram", tone: str = "casual") -> str:
    if platform == "twitter":
        return (
            f"🚀 {topic}\n\nKey takeaway: Focus on high-leverage outcomes and daily "
            "consistency.\n\n#Growth #Tech"
        )
    elif platform == "linkedin":
        return (
            f"Perspective on {topic}:\n\n1. Identify bottlenecks early\n"
            "2. Iterate rapidly based on data\n3. Build scalable distribution\n\n"
            "How is your organization approaching this?\n\n#Leadership #B2B #Innovation"
        )
    elif platform == "facebook":
        return (
            f"We are diving deep into {topic}! 💡 What has been your experience so far? "
            "Drop your insights below!"
        )
    else:  # Instagram
        return (
            f"✨ Exploring {topic}\n\nTransforming ideas into high-impact results takes the "
            "right strategy and focus. Double tap if you agree! 💫\n\n#GrowthMindset "
            "#CreatorCommunity #Innovation #Strategy"
        )


def generate_caption(topic: str, platform: str = "instagram", tone: str = "casual") -> dict:
    constraint = PLATFORM_CONSTRAINTS.get(platform, "general social media best practices")
    messages = [
        {
            "role": "system",
            "content": (
                f"You are a social media copywriter. Write for {platform}: "
                f"{constraint}. Tone: {tone}."
            ),
        },
        {"role": "user", "content": f"Write a caption about: {topic}"},
    ]

    providers = [
        ("groq", _generate_with_groq),
        ("openrouter", _generate_with_openrouter),
        ("gemini", _generate_with_gemini),
    ]

    candidates_by_name = {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        future_to_name = {executor.submit(fn, messages): name for name, fn in providers}
        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                candidates_by_name[name] = future.result()
            except Exception as err:
                candidates_by_name[name] = {
                    "provider": name,
                    "label": name.capitalize(),
                    "model": "unknown",
                    "caption": None,
                    "status": "error",
                    "error": str(err),
                }

    # Ensure consistent order: Groq, OpenRouter, Gemini
    candidates = [candidates_by_name[name] for name, _ in providers if name in candidates_by_name]

    # Select the first successfully generated caption for backward compatibility
    successful_candidate = next(
        (c for c in candidates if c.get("status") == "success" and c.get("caption")),
        None,
    )

    if successful_candidate:
        primary_caption = successful_candidate["caption"]
        primary_model = successful_candidate["model"]
    else:
        primary_caption = _local_template_caption(topic, platform, tone)
        primary_model = "local-template-fallback"

    return {
        "platform": platform,
        "tone": tone,
        "caption": primary_caption,
        "model": primary_model,
        "candidates": candidates,
    }


def generate_hashtags(content: str, platform: str = "instagram", max_tags: int = 10) -> dict:
    client, model_name = _get_active_model_and_client()

    if client:
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": f"Generate up to {max_tags} relevant, non-generic hashtags "
                        f"for {platform}. Return only the hashtags, space-separated, no "
                        "explanation.",
                    },
                    {"role": "user", "content": content},
                ],
                temperature=0.6,
            )
            raw = response.choices[0].message.content.strip()
            hashtags = re.findall(r"#\w+", raw)[:max_tags]
            if hashtags:
                return {"platform": platform, "hashtags": hashtags, "model": model_name}
        except Exception:
            pass

    # Clean words and build tags
    words = re.findall(r"[A-Za-z0-9]{4,}", content)
    derived = [f"#{w.capitalize()}" for w in words[:4]]
    defaults = [
        "#SocialMedia",
        "#ContentStrategy",
        "#DigitalMarketing",
        "#Growth",
        "#TechInnovation",
        "#CreatorEconomy",
        "#Productivity",
    ]
    unique_tags = list(dict.fromkeys(derived + defaults))[:max_tags]

    return {"platform": platform, "hashtags": unique_tags, "model": "local-ai-engine"}


def repurpose_content(content: str, source_platform: str, target_platforms: list) -> dict:
    client, model_name = _get_active_model_and_client()
    results = {}

    if client:
        try:
            for target in target_platforms:
                constraint = PLATFORM_CONSTRAINTS.get(target, "general social media best practices")
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": f"Rewrite the given {source_platform} post for "
                            f"{target}: {constraint}. Preserve the core message and intent.",
                        },
                        {"role": "user", "content": content},
                    ],
                    temperature=0.7,
                )
                results[target] = response.choices[0].message.content.strip()

            return {"sourcePlatform": source_platform, "repurposed": results, "model": model_name}
        except Exception:
            pass

    for target in target_platforms:
        if target == "twitter":
            trimmed = content[:260] + ("..." if len(content) > 260 else "")
            results[target] = f"{trimmed}\n\n#Tech #Insights"
        elif target == "linkedin":
            results[target] = (
                f"Key Insight:\n\n{content}\n\nWhy this matters for modern teams: continuous "
                "improvement drives long-term compound growth.\n\n#Leadership #BusinessStrategy"
            )
        elif target == "instagram":
            results[target] = (
                f"✨ {content}\n\nSave this for later! 📌\n\n#Creators #MarketingTips #Inspiration"
            )
        elif target == "facebook":
            results[target] = f"{content}\n\nWhat are your thoughts on this? Share below!"
        else:
            results[target] = content

    return {"sourcePlatform": source_platform, "repurposed": results, "model": "local-ai-engine"}


PLATFORM_LIMITS = {
    "twitter": 280,
    "instagram": 2200,
    "linkedin": 3000,
    "facebook": 5000,
}


def _clamp_to_platform_limit(text: str, channel: str) -> str:
    limit = PLATFORM_LIMITS.get(channel, 5000)
    if len(text) <= limit:
        return text
    truncated = text[: limit - 3]
    last_space = truncated.rfind(" ")
    if last_space > 0 and (len(truncated) - last_space) < 25:
        truncated = truncated[:last_space]
    return truncated.rstrip() + "..."


def _build_fallback_variant(ch: str, idea: str, tone: str) -> str:
    cleaned = idea.strip()
    if ch == "twitter":
        prefix = "💡 " if tone == "professional" else "✨ "
        body = f"{prefix}{cleaned}"
        return _clamp_to_platform_limit(body, "twitter")
    elif ch == "linkedin":
        if tone in ("casual", "playful"):
            callout = "What has your experience been with this? Let's connect below."
        else:
            callout = "What has your perspective or strategy been on this? Let's discuss."
        return f"{cleaned}\n\n{callout}"
    elif ch == "instagram":
        return f"{cleaned}\n\nSave this for later and share your thoughts below! 📌"
    elif ch == "facebook":
        return f"{cleaned}\n\nWhat are your thoughts on this? Join the conversation below! 👇"
    return cleaned


def _generate_single_channel_variant(
    ch: str,
    idea: str,
    tone: str,
    profile_context: str,
    source_post: dict | None,
    client,
    model_name: str,
) -> dict:
    constraint = PLATFORM_CONSTRAINTS.get(ch, "concise and platform-native")
    title = f"{ch.capitalize()} Post: {idea[:30]}"
    body = None
    is_ai = False

    if client:
        try:
            system_prompt = (
                f"You are an expert social media copywriter. Write a platform-native post "
                f"for {ch} based on the given idea. Requirements: {constraint}. "
                f"Tone: {tone}.{profile_context} Return ONLY the post body text without "
                f"any meta commentary or markdown quotes."
            )
            user_prompt = f"Idea to adapt:\n{idea}"
            if source_post and source_post.get("body"):
                user_prompt += f"\n\nSource post reference:\n{source_post['body']}"

            res = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.7,
            )
            raw_body = res.choices[0].message.content.strip()
            if raw_body:
                body = _clamp_to_platform_limit(raw_body, ch)
                is_ai = True
        except Exception:
            body = None
            is_ai = False

    if not body:
        body = _build_fallback_variant(ch, idea, tone)
        is_ai = False

    tags = re.findall(r"#\w+", body)
    return {
        "channel": ch,
        "content": {
            "title": title,
            "body": body,
            "hashtags": tags if tags else [],
            "mediaUrls": [],
        },
        "tone": tone,
        "provider": "groq" if is_ai else "template",
        "model": model_name if is_ai else "template-fallback",
    }


def generate_variants(
    idea: str,
    channels: list | None = None,
    tone: str = "casual",
    business_profile: dict | None = None,
    source_post: dict | None = None,
) -> dict:
    allowed = ["twitter", "linkedin", "instagram", "facebook"]
    if not channels:
        channels = ["instagram", "facebook"]
    else:
        seen = set()
        clean_channels = []
        for ch in channels:
            if isinstance(ch, str):
                c = ch.lower().strip()
                if c in allowed and c not in seen:
                    seen.add(c)
                    clean_channels.append(c)
        channels = clean_channels if clean_channels else ["instagram", "facebook"]

    idea = idea.strip()[:5000]
    client, model_name = _get_active_model_and_client()

    profile_context = ""
    if business_profile:
        b_type = business_profile.get("businessType", "")
        b_aud = business_profile.get("audience", "")
        b_off = business_profile.get("offer", "")
        profile_context = (
            f" Context: Business={b_type}, Audience={b_aud}, Offer={b_off}."
        )

    variants_by_channel = {}
    with ThreadPoolExecutor(max_workers=min(len(channels), 4)) as executor:
        futures = {
            executor.submit(
                _generate_single_channel_variant,
                ch,
                idea,
                tone,
                profile_context,
                source_post,
                client,
                model_name,
            ): ch
            for ch in channels
        }
        for future in as_completed(futures):
            ch = futures[future]
            try:
                res = future.result()
                variants_by_channel[ch] = res
            except Exception:
                fallback_body = _build_fallback_variant(ch, idea, tone)
                variants_by_channel[ch] = {
                    "channel": ch,
                    "content": {
                        "title": f"{ch.capitalize()} Post: {idea[:30]}",
                        "body": fallback_body,
                        "hashtags": re.findall(r"#\w+", fallback_body),
                        "mediaUrls": [],
                    },
                    "tone": tone,
                    "provider": "template",
                    "model": "template-fallback",
                }

    ordered_variants = [
        variants_by_channel[ch] for ch in channels if ch in variants_by_channel
    ]
    any_ai = any(v.get("provider") == "groq" for v in ordered_variants)
    return {
        "idea": idea,
        "tone": tone,
        "variants": ordered_variants,
        "provider": "groq" if any_ai else "template",
        "model": model_name if any_ai else "template-fallback",
    }
