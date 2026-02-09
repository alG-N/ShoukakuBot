"""
yt-dlp HTTP API Service
Lightweight REST API wrapping yt-dlp for production-scale video downloading.
Bot calls this via HTTP instead of spawning yt-dlp processes directly.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
import asyncio
import os
import time
import shutil

app = FastAPI(title="yt-dlp API", version="1.0.0")

# ── Config ──
DOWNLOAD_DIR = os.environ.get("DOWNLOAD_DIR", "/downloads")
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_DOWNLOADS", "5"))
MAX_DURATION = int(os.environ.get("MAX_DURATION_SECONDS", "600"))
MAX_FILE_SIZE_MB = int(os.environ.get("MAX_FILE_SIZE_MB", "100"))

semaphore = asyncio.Semaphore(MAX_CONCURRENT)
active_downloads = 0


# ── Request Models ──
class InfoRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    quality: str = "720"
    filename: str | None = None


# ── Endpoints ──
@app.get("/health")
async def health():
    """Health check with system info"""
    global active_downloads
    try:
        disk = shutil.disk_usage(DOWNLOAD_DIR)
        disk_free = round(disk.free / 1024 / 1024)
    except Exception:
        disk_free = -1

    return {
        "status": "ok",
        "version": yt_dlp.version.__version__,
        "active_downloads": active_downloads,
        "max_concurrent": MAX_CONCURRENT,
        "disk_free_mb": disk_free,
    }


@app.post("/info")
async def get_info(req: InfoRequest):
    """Get video metadata without downloading"""
    try:
        info = await asyncio.to_thread(_extract_info, req.url)
        return info
    except Exception as e:
        error_msg = _parse_error(str(e))
        raise HTTPException(status_code=400, detail=error_msg)


@app.post("/download")
async def download_video(req: DownloadRequest):
    """Download video and save to shared volume"""
    global active_downloads

    # Acquire semaphore with timeout (don't block forever)
    try:
        await asyncio.wait_for(semaphore.acquire(), timeout=5.0)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=429,
            detail="SERVER_BUSY:Too many concurrent downloads. Try again later.",
        )

    active_downloads += 1
    try:
        result = await asyncio.to_thread(
            _download, req.url, req.quality, req.filename
        )
        return result
    except Exception as e:
        error_msg = _parse_error(str(e))
        raise HTTPException(status_code=400, detail=error_msg)
    finally:
        active_downloads -= 1
        semaphore.release()


# ── Core Logic (runs in thread pool) ──
def _extract_info(url: str) -> dict:
    """Extract video info using yt-dlp library"""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_check_certificate": True,
        "socket_timeout": 15,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    return {
        "title": info.get("title"),
        "duration": info.get("duration"),
        "filesize": info.get("filesize") or info.get("filesize_approx"),
        "uploader": info.get("uploader"),
        "thumbnail": info.get("thumbnail"),
        "url": info.get("url") or info.get("webpage_url"),
    }


def _download(url: str, quality: str, filename: str | None) -> dict:
    """Download video to shared volume"""
    if not filename:
        filename = f"video_{int(time.time() * 1000)}"

    output_template = os.path.join(DOWNLOAD_DIR, f"{filename}.%(ext)s")

    format_string = (
        f"bestvideo[height={quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/"
        f"bestvideo[height<={quality}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/"
        f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/"
        f"bestvideo[height<={quality}]+bestaudio/"
        f"best[height<={quality}][vcodec!*=none]"
    )

    opts = {
        "format": format_string,
        "outtmpl": output_template,
        "noplaylist": True,
        "no_warnings": True,
        "no_check_certificate": True,
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "merge_output_format": "mp4",
        "quiet": True,
    }

    # Duration filter
    if MAX_DURATION > 0:
        opts["match_filter"] = yt_dlp.utils.match_filter_func(
            f"duration <= {MAX_DURATION}"
        )

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    # Find the output file (extension may differ from expected)
    actual_filename = None
    for f in os.listdir(DOWNLOAD_DIR):
        if f.startswith(filename):
            actual_filename = f
            break

    if not actual_filename:
        raise Exception("Download completed but output file not found")

    filepath = os.path.join(DOWNLOAD_DIR, actual_filename)
    file_size = os.path.getsize(filepath)
    file_size_mb = file_size / (1024 * 1024)

    if file_size == 0:
        os.unlink(filepath)
        raise Exception("Downloaded file is empty")

    if file_size_mb > MAX_FILE_SIZE_MB:
        os.unlink(filepath)
        raise Exception(f"FILE_TOO_LARGE:{file_size_mb:.1f}MB")

    ext = os.path.splitext(actual_filename)[1].lstrip(".").upper()

    return {
        "filename": actual_filename,
        "size_mb": round(file_size_mb, 2),
        "duration": info.get("duration"),
        "title": info.get("title"),
        "format": ext if ext else "MP4",
    }


# ── Error Parser ──
def _parse_error(error_text: str) -> str:
    """Parse yt-dlp errors into structured error messages"""
    lower = error_text.lower()

    if "does not pass filter" and "duration" in lower:
        return f"DURATION_TOO_LONG:over {MAX_DURATION // 60} minutes"
    if "does not pass filter" in lower:
        return "DURATION_TOO_LONG:exceeds limit"
    if "private video" in lower or "sign in" in lower:
        return "This video is private or requires login"
    if "copyright" in lower or "blocked" in lower:
        return "This video is blocked due to copyright"
    if "age" in lower or "confirm your age" in lower:
        return "This video is age-restricted"
    if "unavailable" in lower or "not available" in lower:
        return "This video is unavailable"
    if "live" in lower:
        return "Cannot download live streams"
    if "premieres" in lower or "scheduled" in lower:
        return "This video has not premiered yet"
    if "members only" in lower:
        return "This video is for channel members only"
    if "unsupported url" in lower:
        return "Unsupported URL or no video found"

    return error_text


# ── Periodic Cleanup ──
@app.on_event("startup")
async def startup():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    asyncio.create_task(_cleanup_loop())
    print(f"yt-dlp API started (max concurrent: {MAX_CONCURRENT}, max duration: {MAX_DURATION}s)")


async def _cleanup_loop():
    """Clean up old files every 5 minutes"""
    while True:
        await asyncio.sleep(300)
        try:
            _cleanup_old_files()
        except Exception:
            pass


def _cleanup_old_files():
    """Delete files older than 10 minutes"""
    now = time.time()
    for f in os.listdir(DOWNLOAD_DIR):
        filepath = os.path.join(DOWNLOAD_DIR, f)
        try:
            if os.path.isfile(filepath) and now - os.path.getmtime(filepath) > 600:
                os.unlink(filepath)
                print(f"Cleaned up old file: {f}")
        except Exception:
            pass
