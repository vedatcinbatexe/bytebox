PROJECT = {
    "title": "Greeter",
    "files": [
        {"path": "main.py", "content": "from utils.greet import greet\nprint(greet(input()))"},
        {"path": "utils/greet.py", "content": "def greet(name):\n    return f'Hello, {name}!'"},
    ],
    "folders": ["empty"],
    "stdin": "Bytebox",
}

ALICE = {"X-User-Id": "alice-id"}
BOB = {"X-User-Id": "bob-id"}


def create(client, body=PROJECT, user=ALICE):
    response = client.post("/projects", json=body, headers=user)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_get_project(client):
    created = create(client)
    slug = created["slug"]
    assert len(slug) == 8
    assert created["ownerId"] == "alice-id"

    # Anyone can view a project, signed in or not
    project = client.get(f"/projects/{slug}").json()
    assert project["title"] == "Greeter"
    assert project["files"] == PROJECT["files"]
    assert project["folders"] == ["empty"]
    assert project["stdin"] == "Bytebox"
    assert project["forkedFrom"] is None


def test_creating_needs_a_signed_in_user(client):
    assert client.post("/projects", json=PROJECT).status_code == 401


def test_unknown_project_is_404(client):
    assert client.get("/projects/AAAAAAAA").status_code == 404
    assert client.get("/projects/bad-slug!").status_code == 422


def test_only_the_owner_can_update(client):
    slug = create(client)["slug"]
    changed = {**PROJECT, "title": "Renamed"}

    assert client.put(f"/projects/{slug}", json=changed).status_code == 401
    assert client.put(f"/projects/{slug}", json=changed, headers=BOB).status_code == 403
    response = client.put(f"/projects/{slug}", json=changed, headers=ALICE)
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"


def test_only_the_owner_can_delete(client):
    slug = create(client)["slug"]
    assert client.delete(f"/projects/{slug}", headers=BOB).status_code == 403
    assert client.delete(f"/projects/{slug}", headers=ALICE).status_code == 204
    assert client.get(f"/projects/{slug}").status_code == 404


def test_fork_belongs_to_whoever_forked_it(client):
    original = create(client)
    fork = create(client, {**PROJECT, "title": "Bob's fork", "forkedFrom": original["slug"]}, BOB)

    assert fork["slug"] != original["slug"]
    assert fork["forkedFrom"] == original["slug"]
    assert fork["ownerId"] == "bob-id"
    assert client.put(f"/projects/{fork['slug']}", json=PROJECT, headers=ALICE).status_code == 403


def test_fork_of_unknown_project_is_404(client):
    response = client.post("/projects", json={**PROJECT, "forkedFrom": "AAAAAAAA"}, headers=ALICE)
    assert response.status_code == 404


def test_list_my_projects(client):
    create(client, {**PROJECT, "title": "First"})
    create(client, {**PROJECT, "title": "Second"})
    create(client, {**PROJECT, "title": "Bob's"}, BOB)

    mine = client.get("/projects", headers=ALICE).json()
    assert [project["title"] for project in mine] == ["Second", "First"]  # newest first
    assert mine[0]["fileCount"] == 2
    assert client.get("/projects").status_code == 401


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
        assert client.post("/projects", json=body, headers=ALICE).status_code == 422, body


def test_only_the_owner_can_rename(client):
    slug = create(client)["slug"]
    assert client.patch(f"/projects/{slug}", json={"title": "New name"}, headers=BOB).status_code == 403
    assert client.patch(f"/projects/{slug}", json={"title": ""}, headers=ALICE).status_code == 422
    response = client.patch(f"/projects/{slug}", json={"title": "New name"}, headers=ALICE)
    assert response.status_code == 200
    assert response.json()["title"] == "New name"
    assert response.json()["files"] == PROJECT["files"]  # files untouched
