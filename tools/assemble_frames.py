#!/usr/bin/env python3
"""Land the revamped 6.9-inch frames and restore the merge-request CI file."""

import base64
import json
import os
import urllib.request

TOKEN = os.environ["GROUP_API_TOKEN"]
PROJECT = "77757441"
BRANCH = "cursor/ios-1-6-screenshot-revamp-9566"
RAW = (
    "https://gitlab.com/bjamesdowning/ration/-/raw/"
    "cursor/ios-1-6-revamp-ferry-9566/marketing/appstore/uk/framed/6.9/1.6"
)
NAMES = [
    "01-daily-fuel.png",
    "02-agent-sets-fuel.png",
    "03-import.png",
    "04-scan.png",
    "05-galley.png",
    "06-manifest.png",
    "07-supply.png",
    "08-hub.png",
]

STORY_TOP = """# iOS 1.6 screenshot set — upload this

App Store Connect → Media Manager → **iPhone 6.9\" Display**. Upload only [`framed/6.9/1.6/`](framed/6.9/1.6/), in this order. Each file is **1320×2868** PNG, RGB, no alpha. Apple shows the first three in search. The filename order is unchanged. Search still gets the job, then the AI choice, then the import.

| Order | File | Caption |
|------:|------|---------|
| 1 | [`01-daily-fuel.png`](framed/6.9/1.6/01-daily-fuel.png) | Daily Fuel. / Meals, across the days. |
| 2 | [`02-agent-sets-fuel.png`](framed/6.9/1.6/02-agent-sets-fuel.png) | Any agent can run it. / Or use the one inside. |
| 3 | [`03-import.png`](framed/6.9/1.6/03-import.png) | Save it from the video. / TikTok, Reels, and the web. |
| 4 | [`04-scan.png`](framed/6.9/1.6/04-scan.png) | Scan the receipt. / The cupboard updates. |
| 5 | [`05-galley.png`](framed/6.9/1.6/05-galley.png) | Cook from what's here. / Matched to the cupboard. |
| 6 | [`06-manifest.png`](framed/6.9/1.6/06-manifest.png) | The week's meals. / For everyone in the kitchen. |
| 7 | [`07-supply.png`](framed/6.9/1.6/07-supply.png) | The list writes itself. / From the meals you planned. |
| 8 | [`08-hub.png`](framed/6.9/1.6/08-hub.png) | The whole kitchen. / Stock, meals, and today. |

Slide 1 is today's Fuel log, with the Macros screen over it: week, month, or a custom range, the daily average, and how many days were logged. The line under the rule says what the words mean: `Calories, protein, carbs, and fat.` Slide 2 shows the choice. A person's own agent can run the kitchen, and Ask Ration is the assistant inside the app. The names under the rule are type only, with no logos: `Grok · Hermes · Dots · Claude.` Slide 3 keeps the TikTok import photograph and replaces the caption. Slide 4 is the receipt scan, through to the file upload. Slide 5 is Galley, meals matched to what is in the cupboard. Slide 6 is one week for the people who share the kitchen. Slide 7 is the supply list the plan writes. The line under the rule is `Share it, or send it out.` Slide 8 is the Hub: stock, meals, and today.

Leave these in the repo and do **not** upload them for 1.6 (same names under `framed/6.5/` as well): `01-hub.png`, `02-macros.png`, `06-plan.png`, `09-ask.png`, `10-theme.png`. The Hub frame for this set is `framed/6.9/1.6/08-hub.png`, not the older `01-hub.png`.

"""

UPLOAD_TOP = """# App Store Connect upload checklist (UK)

## iOS 1.6 — iPhone 6.9\" only

Upload [`framed/6.9/1.6/`](framed/6.9/1.6/) into **iPhone 6.9\" Display**. Do not upload `framed/6.5/` for this submission, and do not upload the older `framed/6.9/01-hub.png` … `10-theme.png` set.

The filename order is the upload order. It stays in this order because the first three are what search shows: the job, the AI choice, then the import.

| Order | File | Caption | Pixels |
|------:|------|---------|--------|
| 1 | `01-daily-fuel.png` | Daily Fuel. / Meals, across the days. | 1320×2868 |
| 2 | `02-agent-sets-fuel.png` | Any agent can run it. / Or use the one inside. | 1320×2868 |
| 3 | `03-import.png` | Save it from the video. / TikTok, Reels, and the web. | 1320×2868 |
| 4 | `04-scan.png` | Scan the receipt. / The cupboard updates. | 1320×2868 |
| 5 | `05-galley.png` | Cook from what's here. / Matched to the cupboard. | 1320×2868 |
| 6 | `06-manifest.png` | The week's meals. / For everyone in the kitchen. | 1320×2868 |
| 7 | `07-supply.png` | The list writes itself. / From the meals you planned. | 1320×2868 |
| 8 | `08-hub.png` | The whole kitchen. / Stock, meals, and today. | 1320×2868 |

PNG, RGB, no alpha. Slide 1 adds `Calories, protein, carbs, and fat.` Slide 2 names `Grok · Hermes · Dots · Claude` in type only, and shows Ask Ration beside the person's own agent. Slide 7 adds `Share it, or send it out.` Do not upload `08-your-agent.png`.

"""


def api(path):
    req = urllib.request.Request(
        f"https://gitlab.com/api/v4/projects/{PROJECT}{path}",
        headers={"PRIVATE-TOKEN": TOKEN},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def raw_file(file_path, ref):
    quoted = urllib.request.quote(file_path, safe="")
    return api(f"/repository/files/{quoted}/raw?ref={ref}").decode()


def splice(text, marker, top):
    at = text.index(marker)
    return top + text[at:]


def main():
    frames = []
    for name in NAMES:
        with urllib.request.urlopen(f"{RAW}/{name}", timeout=60) as resp:
            data = resp.read()
        if data[1:4] != b"PNG":
            raise SystemExit(f"{name} is not a PNG")
        width = int.from_bytes(data[16:20], "big")
        height = int.from_bytes(data[20:24], "big")
        bit, color = data[24], data[25]
        if (width, height, bit, color) != (1320, 2868, 8, 2):
            raise SystemExit(f"{name} is {width}x{height} bit={bit} color={color}")
        frames.append((name, base64.b64encode(data).decode()))
        print(name, "ok", len(data))

    story = splice(raw_file("marketing/appstore/uk/STORYBOARD.md", "main"), "# Previous storyboard", STORY_TOP)
    upload = splice(raw_file("marketing/appstore/uk/UPLOAD.md", "main"), "## Screenshots", UPLOAD_TOP)
    ci = raw_file(".gitlab-ci.yml", "main")
    if "assemble-frames" in ci or "export-copilot-frame" in ci:
        raise SystemExit("main CI file is not the restore target")

    actions = [
        {"action": "update", "file_path": ".gitlab-ci.yml", "content": ci},
        {"action": "delete", "file_path": "tools/assemble_frames.py"},
        {"action": "update", "file_path": "marketing/appstore/uk/STORYBOARD.md", "content": story},
        {"action": "update", "file_path": "marketing/appstore/uk/UPLOAD.md", "content": upload},
    ]
    for name, encoded in frames:
        actions.append(
            {
                "action": "update",
                "file_path": f"marketing/appstore/uk/framed/6.9/1.6/{name}",
                "content": encoded,
                "encoding": "base64",
            }
        )

    body = json.dumps(
        {
            "branch": BRANCH,
            "commit_message": (
                "Revamp the iOS 1.6 App Store screenshots\n\n"
                "Docs: marketing/appstore/uk/STORYBOARD.md and UPLOAD.md for the revamped 1.6 screenshot set\n"
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
