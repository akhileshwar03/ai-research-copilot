"""Turns an uploaded founder photo into a small, square, metadata-free WebP.

Re-encoding does more than shrink the file: the output carries none of the original's EXIF block, so the
GPS position, device and timestamp that phone photos embed are never published. The photo is also
rotated to match its EXIF orientation first (otherwise portraits taken on a phone come out sideways),
then centre-cropped to a square and bounded in both pixels and bytes.
"""

import io

from PIL import Image, ImageOps

from app.core.exceptions import AppError

PHOTO_SIZE_PX = 512
PHOTO_TARGET_MAX_BYTES = 90 * 1024
# Refuse absurd dimensions before decoding anything (decompression-bomb guard): 40 megapixels is well past
# any phone camera and costs ~160 MB to decode.
MAX_SOURCE_PIXELS = 40_000_000
MIN_SOURCE_SIDE_PX = 160


def process_founder_photo(content: bytes) -> bytes:
    try:
        image = Image.open(io.BytesIO(content))
        width, height = image.size  # reads the header only
    except Exception as exc:
        raise AppError(code="INVALID_FILE_TYPE", message="File is not a valid image", status_code=400) from exc

    if width * height > MAX_SOURCE_PIXELS:
        raise AppError(code="IMAGE_TOO_LARGE", message="That image has too many pixels; resize it first", status_code=413)
    if min(width, height) < MIN_SOURCE_SIDE_PX:
        raise AppError(
            code="IMAGE_TOO_SMALL",
            message=f"The photo must be at least {MIN_SOURCE_SIDE_PX}px on its shorter side",
            status_code=400,
        )

    try:
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except Exception as exc:
        raise AppError(code="INVALID_FILE_TYPE", message="File is not a valid image", status_code=400) from exc

    image = ImageOps.fit(image, (PHOTO_SIZE_PX, PHOTO_SIZE_PX), method=Image.LANCZOS, centering=(0.5, 0.4))

    for quality in (90, 82, 74, 66, 58, 50, 42, 34):
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=quality, method=6)  # no exif= argument: metadata is dropped
        data = buf.getvalue()
        if len(data) <= PHOTO_TARGET_MAX_BYTES:
            return data
    return data
