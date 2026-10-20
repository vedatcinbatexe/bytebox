PROJECT = {
    "title": "Greeter",
    "files": [
        {"path": "main.py", "content": "from utils.greet import greet\nprint(greet(input()))"},
        {"path": "utils/greet.py", "content": "def greet(name):\n    return f'Hello, {name}!'"},
    ],
    "folders": ["empty"],
    "stdin": "Bytebox",
}


def create(client, body=PROJECT):
    response = client.post("/projects", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_get_project(client):
    created = create(client)
    slug = created["project"]["slug"]
    assert len(slug) == 8
    assert created["editToken"]

    project = client.get(f"/projects/{slug}").json()
    assert project["title"] == "Greeter"
    assert project["files"] == PROJECT["files"]
    assert project["folders"] == ["empty"]
    assert project["stdin"] == "Bytebox"
    assert project["forkedFrom"] is None
    assert "editToken" not in project and "editTokenHash" not in project


def test_unknown_project_is_404(client):
    assert client.get("/projects/AAAAAAAA").status_code == 404
    assert client.get("/projects/bad-slug!").status_code == 422


def test_update_needs_the_edit_token(client):
    created = create(client)
    slug, token = created["project"]["slug"], created["editToken"]
    changed = {**PROJECT, "title": "Renamed"}

    assert client.put(f"/projects/{slug}", json=changed).status_code == 403  # no token
    assert client.put(f"/projects/{slug}", json=changed, headers={"X-Edit-Token": "wrong"}).status_code == 403

    response = client.put(f"/projects/{slug}", json=changed, headers={"X-Edit-Token": token})
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"
    assert client.get(f"/projects/{slug}").json()["title"] == "Renamed"


def test_delete_needs_the_edit_token(client):
    created = create(client)
    slug, token = created["project"]["slug"], created["editToken"]

    assert client.delete(f"/projects/{slug}", headers={"X-Edit-Token": "wrong"}).status_code == 403
    assert client.delete(f"/projects/{slug}", headers={"X-Edit-Token": token}).status_code == 204
    assert client.get(f"/projects/{slug}").status_code == 404


def test_fork_creates_a_new_project_with_its_own_token(client):
    original = create(client)
    fork = create(client, {**PROJECT, "title": "My fork", "forkedFrom": original["project"]["slug"]})

    assert fork["project"]["slug"] != original["project"]["slug"]
    assert fork["project"]["forkedFrom"] == original["project"]["slug"]
    assert fork["editToken"] != original["editToken"]

    # The original's token can't edit the fork
    response = client.put(
        f"/projects/{fork['project']['slug']}", json=PROJECT, headers={"X-Edit-Token": original["editToken"]}
    )
    assert response.status_code == 403


def test_fork_of_unknown_project_is_404(client):
    response = client.post("/projects", json={**PROJECT, "forkedFrom": "AAAAAAAA"})
    assert response.status_code == 404


def test_invalid_projects_are_rejected(client):
    invalid = [
        {**PROJECT, "files": []},
        {**PROJECT, "files": [{"path": "../evil.py", "content": ""}]},
        {**PROJECT, "files": [{"path": "/etc/passwd", "content": ""}]},
        {**PROJECT, "files": [{"path": "a.py", "content": ""}, {"path": "a.py", "content": ""}]},
        {**PROJECT, "files": [{"path": f"f{i}.py", "content": ""} for i in range(51)]},
        {**PROJECT, "files": [{"path": "big.py", "content": "#" * (256 * 1024 + 1)}]},
        {**PROJECT, "folders": ["../up"]},
        {**PROJECT, "title": ""},
    ]
    for body in invalid:
        assert client.post("/projects", json=body).status_code == 422, body


ALICE = {"X-User-Id": "alice-id"}
BOB = {"X-User-Id": "bob-id"}


def test_owner_can_edit_without_a_token(client):
    created = client.post("/projects", json=PROJECT, headers=ALICE).json()
    slug = created["project"]["slug"]
    assert created["project"]["ownerId"] == "alice-id"

    changed = {**PROJECT, "title": "Edited by Alice"}
    assert client.put(f"/projects/{slug}", json=changed, headers=ALICE).status_code == 200
    assert client.put(f"/projects/{slug}", json=changed, headers=BOB).status_code == 403
    assert client.delete(f"/projects/{slug}", headers=BOB).status_code == 403
    assert client.delete(f"/projects/{slug}", headers=ALICE).status_code == 204


def test_saving_with_a_token_while_signed_in_claims_the_project(client):
    created = create(client)  # made without login
    slug, token = created["project"]["slug"], created["editToken"]

    response = client.put(f"/projects/{slug}", json=PROJECT, headers={**ALICE, "X-Edit-Token": token})
    assert response.json()["ownerId"] == "alice-id"
    # Now Alice can edit it without the token
    assert client.put(f"/projects/{slug}", json=PROJECT, headers=ALICE).status_code == 200


def test_list_my_projects(client):
    client.post("/projects", json={**PROJECT, "title": "First"}, headers=ALICE)
    client.post("/projects", json={**PROJECT, "title": "Second"}, headers=ALICE)
    client.post("/projects", json={**PROJECT, "title": "Bob's"}, headers=BOB)
    create(client)  # anonymous

    mine = client.get("/projects", headers=ALICE).json()
    assert [project["title"] for project in mine] == ["Second", "First"]  # newest first
    assert mine[0]["fileCount"] == 2
    assert client.get("/projects").status_code == 401
