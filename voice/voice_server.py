"""
voice-server — production de la voix de l'assistante avec le « timbre de l'utilisateur » (OpenVoice v2) sur une base neuronale Microsoft
Port : 3020

- POST /enroll?fmt=mp3&prewarm=[...]  body=audio brut  → crée la signature vocale à partir de l'échantillon utilisateur
- GET  /status                         → {enrolled, modelLoaded}
- POST /tts {text, voice, clone}       → wav bytes (avec cache)
- GET  /health                         → {ok}
"""
import os
import sys
import json
import shutil
import hashlib
import asyncio
import subprocess
import threading
from pathlib import Path

import torch

torch.set_num_threads(2)

BASE = Path("/home/z/my-project/scripts/voice")
DATA = Path("/home/z/my-project/data/voice")
CACHE = DATA / "cache"
DATA.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(BASE / "OpenVoice"))

from flask import Flask, request, jsonify, Response
from openvoice.api import ToneColorConverter

CKPT = BASE / "OpenVoice" / "checkpoints_v2" / "converter"
TONE_PATH = DATA / "tone.pth"
SAMPLE_WAV = DATA / "sample.wav"

converter = None
model_lock = threading.Lock()   # chargement du modèle
synth_lock = threading.Lock()   # une synthèse à la fois — un appel téléphonique est de toute façon séquentiel

app = Flask(__name__)

DEFAULT_VOICE = "fr-FR-DeniseNeural"


def get_converter() -> ToneColorConverter:
    global converter
    with model_lock:
        if converter is None:
            converter = ToneColorConverter(str(CKPT / "config.json"), device="cpu")
            converter.watermark_model = None  # bug de kwarg dans la version officielle
            converter.load_ckpt(str(CKPT / "checkpoint.pth"))
            converter.model.eval()
    return converter


def enrolled() -> bool:
    return TONE_PATH.exists()


def run_ffmpeg(src: Path, dst: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ar", "22050", "-ac", "1", str(dst)],
        check=True,
    )


async def edge_tts(text: str, voice: str, out_mp3: Path) -> None:
    import edge_tts
    c = edge_tts.Communicate(text, voice or DEFAULT_VOICE)
    await c.save(str(out_mp3))


def cache_key(text: str, voice: str, clone: bool) -> Path:
    state = "clone" if (clone and enrolled()) else "plain"
    h = hashlib.sha256(f"{text}|{voice}|{state}".encode()).hexdigest()[:24]
    return CACHE / f"{h}.wav"


def trim_cache(max_files: int = 120) -> None:
    files = sorted(CACHE.glob("*.wav"), key=lambda p: p.stat().st_mtime)
    for p in files[:-max_files] if len(files) > max_files else []:
        try:
            p.unlink()
        except Exception:
            pass


def synthesize(text: str, voice: str, clone: bool) -> Path:
    out = cache_key(text, voice, clone)
    if out.exists():
        return out

    with synth_lock:
        # on revérifie après avoir pris le verrou (requêtes parallèles)
        if out.exists():
            return out
        tmp_mp3 = DATA / "_tmp_base.mp3"
        tmp_wav = DATA / "_tmp_base.wav"
        asyncio.run(edge_tts(text, voice, tmp_mp3))
        run_ffmpeg(tmp_mp3, tmp_wav)

        if clone and enrolled():
            cc = get_converter()
            src_se = cc.extract_se(str(tmp_wav))
            tgt_se = torch.load(str(TONE_PATH), map_location="cpu")
            cc.convert(str(tmp_wav), src_se, tgt_se, output_path=str(out))
        else:
            shutil.move(str(tmp_wav), str(out))
        try:
            tmp_mp3.unlink()
        except Exception:
            pass
        trim_cache()
    return out


def prewarm(phrases: list, voice: str, clone: bool) -> int:
    n = 0
    for p in phrases:
        if not p or not p.strip():
            continue
        try:
            synthesize(p.strip(), voice, clone)
            n += 1
        except Exception:
            pass
    return n


# ---------- Routes ----------

@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/status")
def status():
    return jsonify({
        "ok": True,
        "enrolled": enrolled(),
        "modelLoaded": converter is not None,
        "sampleWav": SAMPLE_WAV.exists(),
    })


@app.post("/enroll")
def enroll():
    fmt = (request.args.get("fmt") or "wav").lower()
    raw = request.get_data()
    if not raw or len(raw) < 2000:
        return jsonify({"ok": False, "error": "l'échantillon audio est trop court"}), 400

    src = DATA / f"_in.{fmt}"
    src.write_bytes(raw)
    try:
        run_ffmpeg(src, SAMPLE_WAV)
    except Exception:
        src.unlink(missing_ok=True)
        return jsonify({"ok": False, "error": "format audio non pris en charge"}), 400
    finally:
        src.unlink(missing_ok=True)

    # la durée de l'échantillon doit être d'au moins 6 secondes
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(SAMPLE_WAV)],
            capture_output=True, text=True, timeout=20,
        )
        dur = float(probe.stdout.strip() or 0)
    except Exception:
        dur = 0
    if dur < 6:
        return jsonify({"ok": False, "error": "l'échantillon doit durer au moins 6 secondes", "duration": dur}), 400

    cc = get_converter()
    se = cc.extract_se(str(SAMPLE_WAV))
    torch.save(se, str(TONE_PATH))

    # purge du cache car le timbre a changé
    for f in CACHE.glob("*.wav"):
        f.unlink(missing_ok=True)

    warmed = 0
    try:
        prewarm_arg = request.args.get("prewarm")
        if prewarm_arg:
            phrases = json.loads(prewarm_arg)
            warmed = prewarm(phrases, request.args.get("voice") or DEFAULT_VOICE, True)
    except Exception:
        pass

    return jsonify({"ok": True, "enrolled": True, "duration": round(dur, 1), "prewarmed": warmed})


@app.post("/tts")
def tts():
    try:
        body = request.get_json(force=True)
        text = (body.get("text") or "").strip()
        voice = body.get("voice") or DEFAULT_VOICE
        clone = bool(body.get("clone", True))
    except Exception:
        return jsonify({"ok": False, "error": "corps de requête invalide"}), 400

    if not text:
        return jsonify({"ok": False, "error": "texte vide"}), 400
    if len(text) > 600:
        text = text[:600]

    try:
        out = synthesize(text, voice, clone)
        data = out.read_bytes()
        return Response(data, mimetype="audio/wav", headers={"Cache-Control": "no-store"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("VOICE_PORT", "3020"))
    app.run(host="127.0.0.1", port=port, threaded=True)
