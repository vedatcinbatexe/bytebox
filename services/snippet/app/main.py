from fastapi import FastAPI

app = FastAPI(title="Bytebox Snippet Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "snippet"}
