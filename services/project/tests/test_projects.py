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


def save(client, slug, title, user=ALICE):
    body = {**PROJECT, "title": title, "files": [{"path": "main.py", "content": f"print('{title}')"}]}
    response = client.put(f"/projects/{slug}", json=body, headers=user)
    assert response.status_code == 200, response.text


def test_every_save_keeps_the_previous_version(client):
    slug = create(client)["slug"]
    save(client, slug, "v2")
    save(client, slug, "v3")

    versions = client.get(f"/projects/{slug}/versions", headers=ALICE).json()
    assert [v["title"] for v in versions] == ["v2", "Greeter"]  # newest first; current (v3) isn't a version
    first = client.get(f"/projects/{slug}/versions/{versions[1]['id']}", headers=ALICE).json()
    assert first["files"] == PROJECT["files"]


def test_restore_brings_back_a_version_and_keeps_the_current_one(client):
    slug = create(client)["slug"]
    save(client, slug, "v2")
    original = client.get(f"/projects/{slug}/versions", headers=ALICE).json()[0]

    restored = client.post(f"/projects/{slug}/versions/{original['id']}/restore", headers=ALICE).json()
    assert restored["title"] == "Greeter"
    assert restored["files"] == PROJECT["files"]
    titles = [v["title"] for v in client.get(f"/projects/{slug}/versions", headers=ALICE).json()]
    assert titles[0] == "v2"  # the replaced version is in history


def test_versions_are_only_for_the_owner(client):
    slug = create(client)["slug"]
    save(client, slug, "v2")
    version_id = client.get(f"/projects/{slug}/versions", headers=ALICE).json()[0]["id"]
    assert client.get(f"/projects/{slug}/versions", headers=BOB).status_code == 403
    assert client.get(f"/projects/{slug}/versions/{version_id}", headers=BOB).status_code == 403
    assert client.post(f"/projects/{slug}/versions/{version_id}/restore", headers=BOB).status_code == 403
    assert client.get(f"/projects/{slug}/versions/not-an-id", headers=ALICE).status_code == 404


def test_autosaves_keep_at_most_one_version_per_two_minutes(client):
    slug = create(client)["slug"]
    for title in ["v2", "v3", "v4"]:
        body = {**PROJECT, "title": title}
        assert client.put(f"/projects/{slug}?autosave=true", json=body, headers=ALICE).status_code == 200
    versions = client.get(f"/projects/{slug}/versions", headers=ALICE).json()
    assert [v["title"] for v in versions] == ["Greeter"]  # only the first autosave kept a version
    assert client.get(f"/projects/{slug}").json()["title"] == "v4"

    save(client, slug, "v5")  # a normal save always keeps one
    assert [v["title"] for v in client.get(f"/projects/{slug}/versions", headers=ALICE).json()] == ["v4", "Greeter"]


def test_only_the_last_30_versions_are_kept(client):
    slug = create(client)["slug"]
    for number in range(35):
        save(client, slug, f"v{number}")
    assert len(client.get(f"/projects/{slug}/versions", headers=ALICE).json()) == 30


def test_projects_are_unlisted_by_default_and_can_be_made_public(client):
    created = create(client)
    assert created["visibility"] == "unlisted"
    assert client.get("/explore").json() == []

    response = client.patch(f"/projects/{created['slug']}", json={"visibility": "public"}, headers=ALICE)
    assert response.json()["visibility"] == "public"
    assert response.json()["title"] == "Greeter"  # title untouched
    assert [p["slug"] for p in client.get("/explore").json()] == [created["slug"]]


def test_private_projects_are_hidden_from_everyone_but_the_owner(client):
    slug = create(client, {**PROJECT, "visibility": "private"})["slug"]
    assert client.get(f"/projects/{slug}").status_code == 404
    assert client.get(f"/projects/{slug}", headers=BOB).status_code == 404
    assert client.get(f"/projects/{slug}", headers=ALICE).status_code == 200
    # and can't be forked by others
    fork = client.post("/projects", json={**PROJECT, "forkedFrom": slug}, headers=BOB)
    assert fork.status_code == 404


def test_owner_login_is_stored_for_explore(client):
    slug = create(client, user={**ALICE, "X-User-Login": "alice"})["slug"]
    client.patch(f"/projects/{slug}", json={"visibility": "public"}, headers=ALICE)
    assert client.get("/explore").json()[0]["ownerLogin"] == "alice"
    assert client.patch(f"/projects/{slug}", json={"visibility": "secret"}, headers=ALICE).status_code == 422


def test_profile_lists_only_public_projects_of_that_user(client):
    alice = {**ALICE, "X-User-Login": "Alice"}
    public = create(client, user=alice)["slug"]
    create(client, user=alice)  # unlisted
    bob_public = create(client, user={**BOB, "X-User-Login": "bob"})["slug"]
    for slug, user in ((public, ALICE), (bob_public, BOB)):
        client.patch(f"/projects/{slug}", json={"visibility": "public"}, headers=user)

    assert [p["slug"] for p in client.get("/users/alice/projects").json()] == [public]  # case-insensitive
    assert client.get("/users/nobody/projects").json() == []
    assert client.get("/users/a.*/projects").json() == []  # not treated as a pattern


def test_star_and_unstar(client):
    slug = create(client)["slug"]
    assert client.put(f"/projects/{slug}/star").status_code == 401

    assert client.put(f"/projects/{slug}/star", headers=BOB).json() == {"starCount": 1, "starredByMe": True}
    assert client.put(f"/projects/{slug}/star", headers=BOB).json()["starCount"] == 1  # twice = once
    assert client.put(f"/projects/{slug}/star", headers=ALICE).json()["starCount"] == 2
    assert client.get(f"/projects/{slug}", headers=BOB).json()["starredByMe"] is True
    assert client.get(f"/projects/{slug}").json()["starredByMe"] is False

    assert client.delete(f"/projects/{slug}/star", headers=BOB).json() == {"starCount": 1, "starredByMe": False}
    assert client.delete(f"/projects/{slug}/star", headers=BOB).json()["starCount"] == 1  # nothing to undo


def test_cannot_star_someone_elses_private_project(client):
    slug = create(client, {**PROJECT, "visibility": "private"})["slug"]
    assert client.put(f"/projects/{slug}/star", headers=BOB).status_code == 404


def test_explore_can_sort_by_stars(client):
    first = create(client, {**PROJECT, "title": "Quiet", "visibility": "public"})["slug"]
    second = create(client, {**PROJECT, "title": "Popular", "visibility": "public"})["slug"]
    client.put(f"/projects/{first}/star", headers=BOB)
    client.put(f"/projects/{first}/star", headers=ALICE)
    client.put(f"/projects/{second}/star", headers=BOB)
    assert [p["title"] for p in client.get("/explore?sort=stars").json()] == ["Quiet", "Popular"]
    assert client.get("/explore?sort=stars").json()[0]["starCount"] == 2
    assert [p["title"] for p in client.get("/explore").json()] == ["Popular", "Quiet"]  # newest first


def test_owner_sets_tags_and_explore_filters_by_tag(client):
    game = create(client)["slug"]
    other = create(client)["slug"]
    for slug in (game, other):
        client.patch(f"/projects/{slug}", json={"visibility": "public"}, headers=ALICE)

    response = client.patch(f"/projects/{game}", json={"tags": [" Game ", "python", "game"]}, headers=ALICE)
    assert response.status_code == 200, response.text
    assert response.json()["tags"] == ["game", "python"]  # cleaned up and without duplicates
    client.patch(f"/projects/{other}", json={"tags": ["python"]}, headers=ALICE)

    assert [p["slug"] for p in client.get("/explore?tag=game").json()] == [game]
    assert client.get("/explore?tag=game").json()[0]["tags"] == ["game", "python"]
    assert client.get("/tags").json() == [{"tag": "python", "count": 2}, {"tag": "game", "count": 1}]
    assert client.get("/projects/" + game).json()["title"] == "Greeter"  # tags don't touch the rest
    assert client.get(f"/projects/{game}/versions", headers=ALICE).json() == []  # nor history


def test_tags_are_checked(client):
    slug = create(client)["slug"]
    assert client.patch(f"/projects/{slug}", json={"tags": ["no spaces"]}, headers=ALICE).status_code == 422
    assert client.patch(f"/projects/{slug}", json={"tags": [f"t{n}" for n in range(6)]}, headers=ALICE).status_code == 422
    assert client.patch(f"/projects/{slug}", json={"tags": ["game"]}, headers=BOB).status_code == 403
    assert client.patch(f"/projects/{slug}", json={"tags": []}, headers=ALICE).json()["tags"] == []


def test_stats_count_projects_and_stars(client):
    public = create(client)["slug"]
    create(client)
    client.patch(f"/projects/{public}", json={"visibility": "public"}, headers=ALICE)
    client.put(f"/projects/{public}/star", headers=BOB)
    assert client.get("/stats").json() == {"projects": 2, "publicProjects": 1, "stars": 1}


def test_forks_are_counted_and_public_ones_listed(client):
    original = create(client)["slug"]
    public_fork = client.post("/projects", json={**PROJECT, "forkedFrom": original}, headers=BOB).json()["slug"]
    client.post("/projects", json={**PROJECT, "forkedFrom": original}, headers=BOB)  # unlisted: counted, not listed
    client.patch(f"/projects/{public_fork}", json={"visibility": "public"}, headers=BOB)

    assert client.get(f"/projects/{original}").json()["forkCount"] == 2
    assert [p["slug"] for p in client.get(f"/projects/{original}/forks").json()] == [public_fork]
    fork = client.get(f"/projects/{public_fork}").json()
    assert fork["forkedFrom"] == original
    assert fork["forkedFromTitle"] == "Greeter"


def test_a_fork_does_not_link_to_a_private_or_deleted_original(client):
    original = create(client)["slug"]
    fork = client.post("/projects", json={**PROJECT, "forkedFrom": original}, headers=BOB).json()["slug"]
    client.patch(f"/projects/{original}", json={"visibility": "private"}, headers=ALICE)
    assert client.get(f"/projects/{fork}", headers=BOB).json()["forkedFrom"] is None
    assert client.get(f"/projects/{original}/forks", headers=BOB).status_code == 404
    client.delete(f"/projects/{original}", headers=ALICE)
    assert client.get(f"/projects/{fork}", headers=BOB).json()["forkedFromTitle"] is None


def test_comments_can_be_added_listed_and_deleted(client):
    slug = create(client)["slug"]
    added = client.post(f"/projects/{slug}/comments", json={"text": "  Nice!  "}, headers={**BOB, "X-User-Login": "bob"})
    assert added.status_code == 201, added.text
    comment = added.json()
    assert comment["text"] == "Nice!"
    assert comment["authorLogin"] == "bob"

    listed = client.get(f"/projects/{slug}/comments", headers=ALICE).json()
    assert [c["text"] for c in listed] == ["Nice!"]
    assert listed[0]["canDelete"] is True  # the project owner
    assert client.get(f"/projects/{slug}/comments").json()[0]["canDelete"] is False  # signed out
    assert client.get(f"/projects/{slug}").json()["commentCount"] == 1

    other = {"X-User-Id": "carol-id"}
    assert client.delete(f"/projects/{slug}/comments/{comment['id']}", headers=other).status_code == 403
    assert client.delete(f"/projects/{slug}/comments/{comment['id']}", headers=BOB).status_code == 204
    assert client.get(f"/projects/{slug}/comments").json() == []


def test_comments_need_a_user_text_and_a_visible_project(client):
    slug = create(client)["slug"]
    assert client.post(f"/projects/{slug}/comments", json={"text": "hi"}).status_code == 401
    assert client.post(f"/projects/{slug}/comments", json={"text": "   "}, headers=BOB).status_code == 422
    assert client.post(f"/projects/{slug}/comments", json={"text": "x" * 1001}, headers=BOB).status_code == 422
    client.patch(f"/projects/{slug}", json={"visibility": "private"}, headers=ALICE)
    assert client.get(f"/projects/{slug}/comments", headers=BOB).status_code == 404
    assert client.post(f"/projects/{slug}/comments", json={"text": "hi"}, headers=BOB).status_code == 404


def test_arguments_are_saved_and_versioned(client):
    slug = create(client, {**PROJECT, "args": "--name Ada"})["slug"]
    assert client.get(f"/projects/{slug}").json()["args"] == "--name Ada"
    client.put(f"/projects/{slug}", json={**PROJECT, "args": "--name Bob"}, headers=ALICE)
    version = client.get(f"/projects/{slug}/versions", headers=ALICE).json()[0]
    restored = client.post(f"/projects/{slug}/versions/{version['id']}/restore", headers=ALICE).json()
    assert restored["args"] == "--name Ada"


def test_invite_link_makes_a_collaborator_who_can_save(client):
    slug = create(client)["slug"]
    assert client.put(f"/projects/{slug}", json=PROJECT, headers=BOB).status_code == 403

    token = client.post(f"/projects/{slug}/invite", headers=ALICE).json()["inviteToken"]
    assert client.post(f"/projects/{slug}/join", json={"token": "wrong"}, headers=BOB).status_code == 404
    joined = client.post(f"/projects/{slug}/join", json={"token": token}, headers={**BOB, "X-User-Login": "bob"})
    assert joined.status_code == 200, joined.text
    assert joined.json()["canEdit"] is True
    assert joined.json()["inviteToken"] is None  # only the owner sees the link
    assert [c["login"] for c in joined.json()["collaborators"]] == ["bob"]

    assert client.put(f"/projects/{slug}", json={**PROJECT, "title": "By Bob"}, headers=BOB).status_code == 200
    assert [p["slug"] for p in client.get("/projects", headers=BOB).json()] == [slug]  # shows in Bob's projects
    # Joining twice changes nothing
    client.post(f"/projects/{slug}/join", json={"token": token}, headers=BOB)
    assert len(client.get(f"/projects/{slug}", headers=ALICE).json()["collaborators"]) == 1


def test_collaborators_are_private_and_can_be_removed(client):
    slug = create(client)["slug"]
    token = client.post(f"/projects/{slug}/invite", headers=ALICE).json()["inviteToken"]
    client.post(f"/projects/{slug}/join", json={"token": token}, headers=BOB)
    client.patch(f"/projects/{slug}", json={"visibility": "private"}, headers=ALICE)

    assert client.get(f"/projects/{slug}", headers=BOB).status_code == 200  # collaborators see private projects
    stranger = client.get(f"/projects/{slug}", headers={"X-User-Id": "carol-id"})
    assert stranger.status_code == 404
    client.patch(f"/projects/{slug}", json={"visibility": "public"}, headers=ALICE)
    public_view = client.get(f"/projects/{slug}").json()
    assert public_view["collaborators"] == [] and public_view["canEdit"] is False

    assert client.patch(f"/projects/{slug}", json={"visibility": "private"}, headers=BOB).status_code == 403  # owner only
    assert client.delete(f"/projects/{slug}/collaborators/bob-id", headers={"X-User-Id": "carol-id"}).status_code == 403
    assert client.delete(f"/projects/{slug}/collaborators/bob-id", headers=BOB).status_code == 204  # leaving
    assert client.put(f"/projects/{slug}", json=PROJECT, headers=BOB).status_code == 403

    client.delete(f"/projects/{slug}/invite", headers=ALICE)
    assert client.post(f"/projects/{slug}/join", json={"token": token}, headers=BOB).status_code == 404
