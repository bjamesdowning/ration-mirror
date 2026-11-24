#!/usr/bin/env python3
"""Put the pre-revamp Galley and Supply frames back, then remove this job."""

import base64
import json
import os
import urllib.request
from pathlib import Path

TOKEN = os.environ["GROUP_API_TOKEN"]
PROJECT = "77757441"
BRANCH = "cursor/ios-1-6-screenshot-revamp-9566"
PATHS = [
    "marketing/appstore/uk/framed/6.9/1.6/05-galley.png",
    "marketing/appstore/uk/framed/6.9/1.6/07-supply.png",
]


def get(url):
    req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": TOKEN})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def file_b64(path, ref):
    quoted = urllib.request.quote(path, safe="")
    payload = json.loads(
        get(f"https://gitlab.com/api/v4/projects/{PROJECT}/repository/files/{quoted}?ref={ref}")
    )
    data = base64.b64decode(payload["content"])
    if data[1:4] != b"PNG":
        raise SystemExit(f"{path} is not a png")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    if (width, height, data[24], data[25]) != (1320, 2868, 8, 2):
        raise SystemExit(f"{path} is {width}x{height} bit={data[24]} color={data[25]}")
    print(path, len(data))
    return base64.b64encode(data).decode()


def raw_text(path, ref):
    quoted = urllib.request.quote(path, safe="")
    return get(
        f"https://gitlab.com/api/v4/projects/{PROJECT}/repository/files/{quoted}/raw?ref={ref}"
    ).decode()


def main():
    actions = []
    for path in PATHS:
        actions.append(
            {
                "action": "update",
                "file_path": path,
                "content": file_b64(path, "main"),
                "encoding": "base64",
            }
        )

    story = Path("marketing/appstore/uk/STORYBOARD.md").read_text()
    story2 = (
        story.replace(
            "Cook from what's here. / Matched to the cupboard.",
            "See what you can cook / with what's here",
        )
        .replace(
            "The list writes itself. / From the meals you planned.",
            "Shop only what / you're still missing",
        )
        .replace(
            "Slide 5 is Galley, meals matched to what is in the cupboard. ",
            "Slide 5 keeps the earlier Galley frame. ",
        )
        .replace(
            "Slide 7 is the supply list the plan writes. The line under the rule is `Share it, or send it out.` ",
            "Slide 7 keeps the earlier Supply frame, with the Saved lists cutout. ",
        )
    )
    if story2 == story:
        raise SystemExit("storyboard did not change")

    upload = Path("marketing/appstore/uk/UPLOAD.md").read_text()
    upload2 = (
        upload.replace(
            "Cook from what's here. / Matched to the cupboard.",
            "See what you can cook / with what's here",
        )
        .replace(
            "The list writes itself. / From the meals you planned.",
            "Shop only what / you're still missing",
        )
        .replace(" Slide 7 adds `Share it, or send it out.`", "")
    )
    if upload2 == upload:
        raise SystemExit("upload notes did not change")

    ci = raw_text(".gitlab-ci.yml", "main")
    if "restore-galley-supply" in ci:
        raise SystemExit("main CI file is not the restore target")

    actions.extend(
        [
            {"action": "update", "file_path": "marketing/appstore/uk/STORYBOARD.md", "content": story2},
            {"action": "update", "file_path": "marketing/appstore/uk/UPLOAD.md", "content": upload2},
            {"action": "update", "file_path": ".gitlab-ci.yml", "content": ci},
            {"action": "delete", "file_path": "tools/restore_frames.py"},
        ]
    )
    body = json.dumps(
        {
            "branch": BRANCH,
            "commit_message": (
                "Restore the previous Galley and Supply screenshots\n\n"
                "Docs: marketing/appstore/uk/STORYBOARD.md and UPLOAD.md for slides 5 and 7\n"
            ),
            "actions": actions,
        }
    ).encode()
    req = urllib.request.Request(
        f"https://gitlab.com/api/v4/projects/{PROJECT}/repository/commits",
        data=body,
        headers={"PRIVATE-TOKEN": TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        print(resp.status)
        print(resp.read()[:400].decode())


if __name__ == "__main__":
    main()
