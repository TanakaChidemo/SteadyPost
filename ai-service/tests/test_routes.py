from app.main import create_app


def test_health_endpoint():
    app = create_app()
    client = app.test_client()
    res = client.get("/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "ok"


def test_variants_missing_idea():
    app = create_app()
    client = app.test_client()
    res = client.post("/generate/variants", json={})
    assert res.status_code == 400
    data = res.get_json()
    assert "error" in data


def test_variants_oversized_idea():
    app = create_app()
    client = app.test_client()
    long_idea = "x" * 5001
    res = client.post("/generate/variants", json={"idea": long_idea})
    assert res.status_code == 400
    data = res.get_json()
    assert "exceeds limit" in data["error"]


def test_variants_success():
    app = create_app()
    client = app.test_client()
    res = client.post(
        "/generate/variants",
        json={
            "idea": "New espresso roast launch this weekend",
            "channels": ["instagram", "facebook"],
            "tone": "casual",
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "variants" in data
    assert len(data["variants"]) == 2
    assert data["variants"][0]["channel"] == "instagram"
    assert data["variants"][1]["channel"] == "facebook"
