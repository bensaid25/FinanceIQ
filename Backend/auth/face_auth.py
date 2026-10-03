"""Reconnaissance faciale (DeepFace / VGG-Face).

Différences avec l'ancienne version :
- les photos sont rangées par identifiant numérique (pas de nom d'utilisateur dans un chemin) ;
- un visage doit être détecté (enforce_detection=True), sinon l'image est refusée ;
- plus d'`except: continue` silencieux : les erreurs techniques sont journalisées et remontent ;
- le seuil est strict et configurable, la décision se prend à la majorité des photos.
"""
import base64
import binascii
import logging
import math
import os
import shutil
import tempfile
from contextlib import contextmanager

log = logging.getLogger("financeiq.face")

FACES_DIR = os.environ.get(
    "FINANCEIQ_FACES_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "faces"),
)
MODEL_NAME = "VGG-Face"
DETECTOR = os.environ.get("FACE_DETECTOR", "opencv")
MAX_DISTANCE = float(os.environ.get("FACE_MAX_DISTANCE", "0.55"))  # cosinus : plus bas = plus strict

MIN_PHOTOS = 3
MAX_PHOTOS = 8
MAX_BYTES = 3 * 1024 * 1024

NO_FACE_MSG = "Aucun visage détecté. Placez-vous face à la caméra, avec de la lumière sur le visage."


class FaceError(Exception):
    """Problème côté utilisateur (image invalide, pas de visage...) : message affichable."""


# ── Images ────────────────────────────────────────────────────
def _decode(b64: str) -> bytes:
    if not isinstance(b64, str) or not b64:
        raise FaceError("Image manquante")
    if "," in b64[:100]:
        b64 = b64.split(",", 1)[1]
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise FaceError("Image invalide")
    if len(data) > MAX_BYTES:
        raise FaceError("Image trop volumineuse")
    if not (data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG")):
        raise FaceError("Format d'image non supporté (JPEG ou PNG)")
    return data


@contextmanager
def _temp_image(data: bytes):
    fd, path = tempfile.mkstemp(suffix=".jpg")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        yield path
    finally:
        if os.path.exists(path):
            os.remove(path)


def _user_dir(user_id: int) -> str:
    return os.path.join(FACES_DIR, str(int(user_id)))


def _photos(user_id: int) -> list:
    folder = _user_dir(user_id)
    if not os.path.isdir(folder):
        return []
    return sorted(
        os.path.join(folder, f) for f in os.listdir(folder)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    )


# ── Appels DeepFace (isolés pour pouvoir les remplacer dans les tests) ──
def assert_face(path: str) -> None:
    from deepface import DeepFace
    try:
        faces = DeepFace.extract_faces(img_path=path, detector_backend=DETECTOR, enforce_detection=True)
    except ValueError as err:
        if "could not be detected" in str(err):
            raise FaceError(NO_FACE_MSG) from err
        raise  # vraie panne (OpenCV cassé, modèle manquant...) : ne pas la déguiser en "pas de visage"
    if not faces:
        raise FaceError(NO_FACE_MSG)


def _verify_pair(probe_path: str, ref_path: str) -> float:
    from deepface import DeepFace
    result = DeepFace.verify(
        img1_path=probe_path, img2_path=ref_path,
        model_name=MODEL_NAME, detector_backend=DETECTOR,
        distance_metric="cosine", enforce_detection=True,
    )
    return float(result["distance"])


# ── API utilisée par les routes ───────────────────────────────
def verify_probe(b64_image: str, user_id: int) -> bool:
    """True si le visage correspond à la majorité des photos enregistrées.
    Lève FaceError pour un problème d'image, RuntimeError pour une panne technique."""
    refs = _photos(user_id)
    if not refs:
        raise FaceError("Aucun visage enregistré pour ce compte.")

    data = _decode(b64_image)
    distances = []
    with _temp_image(data) as probe:
        assert_face(probe)
        for ref in refs:
            try:
                distances.append(_verify_pair(probe, ref))
            except Exception:
                log.exception("Comparaison faciale échouée (%s)", os.path.basename(ref))
    if not distances:
        raise RuntimeError("Aucune comparaison faciale n'a abouti")

    matches = sum(1 for d in distances if d <= MAX_DISTANCE)
    needed = math.ceil(len(refs) / 2)
    log.info("Vérification visage user=%s : %d/%d correspondances (min %d), meilleure distance %.3f",
             user_id, matches, len(refs), needed, min(distances))
    return matches >= needed


def save_enrollment(user_id: int, images: list) -> int:
    """Valide puis enregistre les photos (remplace les anciennes). Retourne le nombre de photos."""
    if not isinstance(images, list) or not (MIN_PHOTOS <= len(images) <= MAX_PHOTOS):
        raise FaceError(f"Il faut entre {MIN_PHOTOS} et {MAX_PHOTOS} photos")
    datas = [_decode(img) for img in images]

    os.makedirs(FACES_DIR, exist_ok=True)
    staging = tempfile.mkdtemp(dir=FACES_DIR, prefix=".enroll_")
    try:
        for i, data in enumerate(datas, 1):
            path = os.path.join(staging, f"face_{i}.jpg")
            with open(path, "wb") as f:
                f.write(data)
            try:
                assert_face(path)
            except FaceError as err:
                raise FaceError(f"Photo {i} : {err}") from err

        target = _user_dir(user_id)
        if os.path.isdir(target):
            shutil.rmtree(target)
        os.replace(staging, target)
        staging = None
    finally:
        if staging:
            shutil.rmtree(staging, ignore_errors=True)
    return len(datas)
