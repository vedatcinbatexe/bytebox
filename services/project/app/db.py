import os

from pymongo import MongoClient

client = MongoClient(os.environ.get("MONGO_URL", "mongodb://bytebox:bytebox@localhost:27017"))
database = client[os.environ.get("MONGO_DB", "bytebox")]

# One document per project; the share slug is the _id, so it is unique
projects = database["projects"]
