from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
headers = {"Authorization": "Bearer test-user"}

def test_health():
    assert client.get("/api/v1/health").json()["status"] == "ok"

def test_auth_required():
    assert client.get("/api/v1/auth/me").status_code == 401

def test_create_and_read_interview():
    payload = {"platform":"leetcode","problem_slug":"two-sum","problem_title":"Two Sum","difficulty":"easy"}
    created = client.post("/api/v1/interviews", headers=headers, json=payload)
    assert created.status_code == 201
    interview_id = created.json()["id"]
    assert client.get(f"/api/v1/interviews/{interview_id}", headers=headers).status_code == 200
    assert client.get(f"/api/v1/interviews/{interview_id}", headers={"Authorization":"Bearer another-user"}).status_code == 404

