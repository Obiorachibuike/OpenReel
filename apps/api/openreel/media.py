import json
import os
import subprocess
from pathlib import Path

ROOT = Path(os.getenv("STORAGE_PATH", "./storage")).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
INPUT_GUARD = [
    "-protocol_whitelist",
    "file,pipe",
    "-format_whitelist",
    "image2,png_pipe,jpeg_pipe,webp_pipe,bmp_pipe,gif,mov,matroska,webm,wav,mp3,ogg,flac,aac",
]


def path_for(key):
    path = (ROOT / key).resolve()
    if path.parent != ROOT:
        raise ValueError("Invalid storage key")
    return path


def probe(path):
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            *INPUT_GUARD,
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        timeout=30,
        check=True,
    )
    return json.loads(result.stdout)


def subtitle_time(seconds):
    cs = round(seconds * 100)
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


def ass_text(text):
    return (
        text.replace("\\", "")
        .replace("{", "")
        .replace("}", "")
        .replace("\r", "")
        .replace("\n", r"\N")
    )


def subtitles(scenes, path):
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,40,40,80,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    t = 0
    for scene in scenes:
        end = t + scene["duration"]
        if scene["narration"]:
            header += f"Dialogue: 0,{subtitle_time(t)},{subtitle_time(end)},Default,,0,0,0,,{ass_text(scene['narration'])}\n"
        t = end
    path.write_text(header)


def render(payload, directory, update):
    width, height = {"9:16": (720, 1280), "16:9": (1280, 720), "1:1": (720, 720)}[
        payload["ratio"]
    ]
    parts = []
    for index, scene in enumerate(payload["scenes"]):
        update(index * 80 // len(payload["scenes"]), f"Rendering scene {index + 1}")
        source = path_for(scene["path"])
        probe(source)
        output = directory / f"scene{index}.mp4"
        args = [
            "ffmpeg",
            "-nostdin",
            "-y",
            "-v",
            "error",
            "-threads",
            "2",
            "-filter_threads",
            "1",
        ]
        args += ["-loop", "1"] if scene["kind"] == "image" else ["-stream_loop", "-1"]
        args += [
            *INPUT_GUARD,
            "-i",
            str(source),
            "-t",
            str(scene["duration"]),
            "-vf",
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1",
            "-r",
            "24",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "2",
            str(output),
        ]
        subprocess.run(args, capture_output=True, timeout=180, check=True)
        parts.append(output)
    update(85, "Assembling and applying captions / audio")
    listing = directory / "concat.txt"
    listing.write_text("\n".join(f"file '{p}'" for p in parts))
    caption = directory / "captions.ass"
    subtitles(payload["scenes"], caption)
    output = directory / "output.mp4"
    args = [
        "ffmpeg",
        "-nostdin",
        "-y",
        "-v",
        "error",
        "-threads",
        "2",
        "-filter_threads",
        "1",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(listing),
    ]
    if payload.get("music"):
        args += [
            "-stream_loop",
            "-1",
            *INPUT_GUARD,
            "-i",
            str(path_for(payload["music"])),
            "-af",
            f"dynaudnorm=p=0.5:m=3,volume={payload['music_volume']}",
            "-c:a",
            "aac",
            "-shortest",
        ]
    args += [
        "-vf",
        f"ass={caption}",
        "-t",
        str(sum(s["duration"] for s in payload["scenes"])),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",
        "-movflags",
        "+faststart",
        str(output),
    ]
    subprocess.run(args, capture_output=True, timeout=600, check=True)
    metadata = probe(output)
    if output.stat().st_size < 100 or not any(
        s["codec_type"] == "video" for s in metadata["streams"]
    ):
        raise ValueError("Output validation failed")
    return output, metadata
