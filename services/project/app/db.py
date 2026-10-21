import os

from pymongo import MongoClient

client = MongoClient(os.environ.get("MONGO_URL", "mongodb://bytebox:bytebox@localhost:27017"))
database = client[os.environ.get("MONGO_DB", "bytebox")]

# One document per project; the share slug is the _id, so it is unique
projects = database["projects"]
projects.create_index("owner_id")
projects.create_index("tags")
projects.create_index("forked_from")

# One document per (project, user) star
stars = database["stars"]
stars.create_index([("project_id", 1), ("user_id", 1)], unique=True)

# Earlier versions of projects, saved before every change (newest kept, see main.py)
versions = database["project_versions"]
versions.create_index([("project_id", 1), ("saved_at", -1)])

# Comments on projects, oldest first
comments = database["comments"]
comments.create_index([("project_id", 1), ("created_at", 1)])
