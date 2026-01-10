import os
import re
import sys
import uuid
import shutil
import asyncio
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, File, UploadFile, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
UPLOADS = DATA / "uploads"
JOBS = DATA / "jobs"

UPLOADS.mkdir(parents=True, exist_ok=True)
JOBS.mkdir(parents=True, exist_ok=True)


def _safe_ext(name: str) -> str:
    name = (name or "").strip().lower()
    m = re.search(r"\.([a-z0-9]{1,8})$", name)
    if not m:
        return "bin"
    ext = m.group(1)
    if ext in {"wav", "mp3", "flac", "m4a", "mp4", "aac", "ogg", "opus", "webm", "ac3", "eac3", "ec3", "ac4"}:
        return ext
    return "bin"


def _url_base(req: Request) -> str:
    return str(req.base_url).rstrip("/")


def _prediction_payload(job: "Job") -> Dict[str, Any]:
    out: Dict[str, Any] = {"id": job.id, "status": job.status}
    if job.error:
        out["error"] = job.error
    if job.output is not None:
        out["output"] = job.output
    return out


@dataclass
class Job:
    id: str
    input_path: Path
    status: str
    error: str = ""
    output: Optional[Dict[str, Any]] = None


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"] ,
    allow_headers=["*"],
)

app.mount("/files", StaticFiles(directory=str(DATA)), name="files")

_jobs: Dict[str, Job] = {}


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {"ok": True, "service": "demucs", "model": "htdemucs_6s"}


@app.post("/decode")
async def decode_audio(req: Request, background_tasks: BackgroundTasks) -> FileResponse:
    fn = req.headers.get("x-filename", "")
    try:
        fn = fn.strip()
    except Exception:
        fn = ""

    ext = _safe_ext(fn)
    job_id = uuid.uuid4().hex
    in_path = UPLOADS / f"decode_{job_id}.{ext}"
    fmt = str(req.query_params.get("format") or "wav").strip().lower()
    if fmt not in {"wav", "m4a", "mp3"}:
        fmt = "wav"

    out_ext = "wav" if fmt == "wav" else ("mp3" if fmt == "mp3" else "m4a")
    out_path = JOBS / f"decode_{job_id}.{out_ext}"

    try:
        total = 0
        with in_path.open("wb") as f:
            async for chunk in req.stream():
                if not chunk:
                    continue
                f.write(chunk)
                total += len(chunk)
        if total <= 0:
            try:
                in_path.unlink(missing_ok=True)
            except Exception:
                pass
            return JSONResponse({"ok": False, "error": "empty_body"}, status_code=400)
    except Exception:
        try:
            in_path.unlink(missing_ok=True)
        except Exception:
            pass
        return JSONResponse({"ok": False, "error": "write_failed"}, status_code=500)

    ffmpeg_bin = (os.environ.get("FFMPEG_BIN") or "ffmpeg").strip() or "ffmpeg"
    def _cmd_for(f: str, out: Path) -> list:
        base_cmd = [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-fflags",
            "+discardcorrupt",
            "-i",
            str(in_path),
            "-vn",
            "-sn",
            "-dn",
            "-ac",
            "2",
            "-ar",
            "48000",
        ]
        if f == "mp3":
            return base_cmd + ["-c:a", "libmp3lame", "-q:a", "2", str(out)]
        if f == "wav":
            return base_cmd + ["-acodec", "pcm_s16le", "-f", "wav", str(out)]
        return base_cmd + ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)]

    def _call(cmd: list) -> subprocess.CompletedProcess:
        return subprocess.run(cmd, capture_output=True, text=True)

    proc = await asyncio.to_thread(_call, _cmd_for(fmt, out_path))
    if proc.returncode != 0 or (not out_path.exists()):
        chain = []
        if fmt == "mp3":
            chain = ["m4a", "wav"]
        elif fmt == "m4a":
            chain = ["wav"]

        for fb in chain:
            try:
                out_path.unlink(missing_ok=True)
            except Exception:
                pass
            out_ext = "wav" if fb == "wav" else ("mp3" if fb == "mp3" else "m4a")
            out_path = JOBS / f"decode_{job_id}.{out_ext}"
            proc = await asyncio.to_thread(_call, _cmd_for(fb, out_path))
            if proc.returncode == 0 and out_path.exists():
                fmt = fb
                break

    if proc.returncode != 0 or (not out_path.exists()):
        try:
            in_path.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            out_path.unlink(missing_ok=True)
        except Exception:
            pass
        msg = (proc.stderr or proc.stdout or "decode_failed").strip()
        return JSONResponse({"ok": False, "error": "decode_failed", "detail": msg[:4000]}, status_code=500)

    def _cleanup() -> None:
        try:
            in_path.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            out_path.unlink(missing_ok=True)
        except Exception:
            pass

    background_tasks.add_task(_cleanup)

    media = "audio/wav" if fmt == "wav" else ("audio/mpeg" if fmt == "mp3" else "audio/mp4")
    filename = f"decoded.{out_ext}"
    resp = FileResponse(path=str(out_path), media_type=media, filename=filename)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.post("/api/demucs/upload")
async def demucs_upload(req: Request, file: UploadFile = File(...)) -> JSONResponse:
    ext = _safe_ext(file.filename)
    up_id = uuid.uuid4().hex
    dest = UPLOADS / f"{up_id}.{ext}"
    try:
        with dest.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    finally:
        try:
            await file.close()
        except Exception:
            pass

    audio_url = f"{_url_base(req)}/files/uploads/{dest.name}"
    return JSONResponse({"ok": True, "audio_url": audio_url})


def _resolve_audio_url_to_path(audio_url: str) -> Optional[Path]:
    try:
        u = urlparse(str(audio_url or "").strip())
        p = u.path or ""
        if not p.startswith("/files/uploads/"):
            return None
        name = p.split("/files/uploads/", 1)[1]
        name = name.replace("..", "")
        path = UPLOADS / name
        if not path.exists() or not path.is_file():
            return None
        return path
    except Exception:
        return None


async def _run_demucs(job: Job, model: str) -> None:
    job.status = "processing"
    job.error = ""
    job.output = None

    out_root = JOBS / job.id
    sep_root = out_root / "separated"
    stems_root = out_root / "stems"
    sep_root.mkdir(parents=True, exist_ok=True)
    stems_root.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "demucs.separate",
        "-n",
        model,
        "-o",
        str(sep_root),
        str(job.input_path),
    ]

    def _call() -> subprocess.CompletedProcess:
        return subprocess.run(cmd, capture_output=True, text=True)

    proc = await asyncio.to_thread(_call)

    if proc.returncode != 0:
        job.status = "failed"
        msg = (proc.stderr or proc.stdout or "demucs_failed").strip()
        job.error = msg[:4000]
        return

    model_dir = sep_root / model
    if not model_dir.exists():
        job.status = "failed"
        job.error = "demucs_no_output"
        return

    candidates = [p for p in model_dir.rglob("*.wav") if p.is_file()]
    if not candidates:
        job.status = "failed"
        job.error = "demucs_no_stems"
        return

    stem_map: Dict[str, Path] = {}
    for p in candidates:
        k = p.stem.lower()
        if k in {"vocals", "drums", "bass", "other", "guitar", "piano"}:
            stem_map[k] = p

    if not stem_map:
        job.status = "failed"
        job.error = "demucs_stems_missing"
        return

    for k, src in stem_map.items():
        dst = stems_root / f"{k}.wav"
        try:
            shutil.copyfile(src, dst)
        except Exception:
            pass

    job.status = "succeeded"


@app.post("/api/demucs/start")
async def demucs_start(req: Request, payload: Dict[str, Any]) -> JSONResponse:
    audio_url = str(payload.get("audio_url") or "").strip()
    model = str(payload.get("model") or "htdemucs_6s").strip()
    if not model:
        model = "htdemucs_6s"

    input_path = _resolve_audio_url_to_path(audio_url)
    if input_path is None:
        return JSONResponse({"ok": False, "error": "invalid_audio_url"}, status_code=400)

    job_id = uuid.uuid4().hex
    job = Job(id=job_id, input_path=input_path, status="starting")
    _jobs[job_id] = job

    async def _bg() -> None:
        try:
            await _run_demucs(job, model)
        except Exception as e:
            job.status = "failed"
            job.error = str(e)[:4000]

    asyncio.create_task(_bg())

    return JSONResponse({"ok": True, "prediction": _prediction_payload(job)})


@app.get("/api/demucs/status")
async def demucs_status(req: Request, id: str) -> JSONResponse:
    job = _jobs.get(str(id or "").strip())
    if job is None:
        return JSONResponse({"ok": False, "error": "not_found"}, status_code=404)

    if job.status == "succeeded" and job.output is None:
        stems_root = JOBS / job.id / "stems"
        stems: Dict[str, str] = {}
        profile: Dict[str, float] = {}
        for k in ["vocals", "drums", "bass", "other", "guitar", "piano"]:
            p = stems_root / f"{k}.wav"
            if p.exists() and p.is_file():
                stems[k] = f"{_url_base(req)}/files/jobs/{job.id}/stems/{p.name}"
                profile[k] = 1.0
        job.output = {"stems": stems, "profile": profile}

    return JSONResponse({"ok": True, "prediction": _prediction_payload(job)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8787")))
