"""사진 업로드 라우터."""
import asyncio
import io
import logging
import uuid as uuid_module
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image

from app.database import get_supabase
from app.dependencies import get_current_photographer
from app.storage import upload_to_r2

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
THUMB_MAX_SIZE = 1200
THUMB_JPEG_QUALITY = 85

# Pillow / boto3 블로킹 작업용 스레드풀
_executor = ThreadPoolExecutor(max_workers=8)


def _make_thumbnail_sync(image_bytes: bytes, content_type: str) -> bytes:
    """동기 썸네일 생성 (executor에서 호출)."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=THUMB_JPEG_QUALITY)
    return buf.getvalue()


def _upload_to_r2_sync(key: str, body: bytes, content_type: str):
    """동기 R2 업로드 (executor에서 호출)."""
    return upload_to_r2(key, body, content_type)


async def _process_one(
    loop: asyncio.AbstractEventLoop,
    contents: bytes,
    content_type: str,
    number: int,
    project_id: str,
    photographer_id: UUID,
) -> Optional[Tuple[str, int]]:
    """파일 하나: 썸네일 생성 → R2 업로드. 성공 시 (r2_url, number) 반환."""
    try:
        thumb_bytes = await loop.run_in_executor(
            _executor,
            _make_thumbnail_sync,
            contents,
            content_type,
        )
    except Exception as e:
        logger.warning("thumbnail failed for number %s: %s", number, e)
        return None
    key = f"photos/{photographer_id}/{project_id}/{uuid_module.uuid4().hex}.jpg"
    try:
        r2_url = await loop.run_in_executor(
            _executor,
            _upload_to_r2_sync,
            key,
            thumb_bytes,
            "image/jpeg",
        )
    except Exception as e:
        logger.warning("R2 upload failed for number %s: %s", number, e)
        return None
    if not r2_url:
        return None
    return (r2_url, number)


@router.post("/photos")
async def upload_photos(
    project_id: str = Form(...),
    files: list[UploadFile] = File(...),
    photographer_id: UUID = Depends(get_current_photographer),
):
    """
    사진 일괄 업로드: 썸네일 생성 후 R2 업로드, photos 테이블 INSERT, projects.photo_count UPDATE.
    asyncio.gather로 파일 병렬 처리, Pillow/boto3는 run_in_executor로 스레드풀 실행.
    photo number는 병렬 전에 순서대로 미리 할당.
    """
    if not files:
        raise HTTPException(status_code=400, detail="At least one file required")

    try:
        supabase = get_supabase()
    except Exception as e:
        logger.exception("get_supabase failed")
        raise HTTPException(status_code=503, detail="DB 연결 실패") from e

    # 프로젝트 소유 확인
    project_r = (
        supabase.table("projects")
        .select("id")
        .eq("id", project_id)
        .eq("photographer_id", str(photographer_id))
        .limit(1)
        .execute()
    )
    if not project_r.data or len(project_r.data) == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    # 허용된 파일만 읽고, number 미리 순서대로 할당 (contents, content_type, original_filename)
    valid: list[tuple[bytes, str, str]] = []
    for f in files:
        if not f.content_type or f.content_type not in ALLOWED_CONTENT_TYPES:
            continue
        contents = await f.read()
        if not contents:
            continue
        valid.append((contents, f.content_type or "image/jpeg", f.filename or ""))

    if not valid:
        raise HTTPException(status_code=400, detail="No valid image files (jpeg, png, webp)")

    # base_number 조회 후 number 1..len(valid) 순서 할당
    max_r = (
        supabase.table("photos")
        .select("number")
        .eq("project_id", project_id)
        .order("number", desc=True)
        .limit(1)
        .execute()
    )
    base_number = max_r.data[0]["number"] if max_r.data else 0
    numbers = [base_number + i for i in range(1, len(valid) + 1)]

    loop = asyncio.get_event_loop()
    tasks = [
        _process_one(loop, contents, content_type, num, project_id, photographer_id)
        for (contents, content_type, _), num in zip(valid, numbers)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 성공한 항목만 수집 (예외는 로깅), 원본 파일명 매칭
    rows: list[dict] = []
    for r, (_, __, original_filename) in zip(results, valid):
        if isinstance(r, Exception):
            logger.warning("process task failed: %s", r)
            continue
        if r is not None:
            r2_url, number = r
            row: dict = {
                "project_id": project_id,
                "number": number,
                "r2_thumb_url": r2_url,
            }
            if original_filename:
                row["original_filename"] = original_filename
            rows.append(row)

    if not rows:
        return {"uploaded": 0}

    # DB INSERT: 순서 유지 (number 기준으로 이미 정렬됨)
    rows.sort(key=lambda x: x["number"])
    try:
        for row in rows:
            supabase.table("photos").insert(row).execute()
    except Exception as e:
        logger.exception("photos insert failed: %s", e)
        raise HTTPException(status_code=500, detail="사진 저장 실패") from e

    photo_count = base_number + len(rows)
    update_payload: dict = {"photo_count": photo_count}
    try:
        proj = (
            supabase.table("projects")
            .select("status")
            .eq("id", project_id)
            .limit(1)
            .execute()
        )
        if proj.data and len(proj.data) > 0 and proj.data[0].get("status") == "preparing":
            update_payload["status"] = "selecting"
        supabase.table("projects").update(update_payload).eq(
            "id", project_id
        ).execute()
    except Exception as e:
        logger.exception("projects photo_count update failed: %s", e)
        raise HTTPException(status_code=500, detail="프로젝트 업데이트 실패") from e

    return {"uploaded": len(rows)}


PROFILE_IMAGE_MAX_SIZE = 400
PROFILE_JPEG_QUALITY = 85


def _resize_profile_image_sync(image_bytes: bytes, content_type: str) -> bytes:
    """프로필 이미지 리사이즈: 최장변 400px, JPEG 85%."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((PROFILE_IMAGE_MAX_SIZE, PROFILE_IMAGE_MAX_SIZE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=PROFILE_JPEG_QUALITY)
    return buf.getvalue()


@router.post("/profile-image")
async def upload_profile_image(
    file: UploadFile = File(...),
    photographer_id: UUID = Depends(get_current_photographer),
):
    """
    프로필 이미지 1장 업로드: 리사이즈(최장변 400px, JPEG 85%) 후 R2 업로드.
    경로: profiles/{photographer_id}/{uuid}.jpg
    """
    if not file.content_type or file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="image/jpeg, image/png, image/webp only")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    loop = asyncio.get_event_loop()
    try:
        resized = await loop.run_in_executor(
            _executor,
            _resize_profile_image_sync,
            contents,
            file.content_type or "image/jpeg",
        )
    except Exception as e:
        logger.warning("profile image resize failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid image") from e

    key = f"profiles/{photographer_id}/{uuid_module.uuid4().hex}.jpg"
    try:
        r2_url = await loop.run_in_executor(
            _executor,
            _upload_to_r2_sync,
            key,
            resized,
            "image/jpeg",
        )
    except Exception as e:
        logger.exception("profile image R2 upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Upload failed") from e

    if not r2_url:
        raise HTTPException(status_code=500, detail="R2 URL not configured")

    return {"url": r2_url}
