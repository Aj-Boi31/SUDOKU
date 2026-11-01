"""Rebuild docs/demo.gif by playing the real game in Chrome.

Serves the repo with `python -m http.server`, opens sudoku.html with Playwright and
drives the page the way a player would: picking a difficulty, pencilling notes, making a
wrong move, undoing it, using a hint, switching to dark theme and filling in the rest of
the board with real clicks and key presses. The digits it types come from the game's own
solution, so the script is just a fast, steady player. Only the captions are added.

    pip install Pillow playwright
    python docs/demo/make_demo_gif.py [--channel chrome|msedge]
"""

from __future__ import annotations

import argparse
import io
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

from termgif import BROWSER_SIZE, Timeline, with_caption

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "demo.gif"
ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}

# Lay the page out at 1375x715 and shrink it to the GIF size so the whole board fits.
SCALE = 0.8
VIEWPORT = {"width": round(BROWSER_SIZE[0] / SCALE), "height": round(BROWSER_SIZE[1] / SCALE)}


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="chrome", help="installed browser for Playwright: chrome or msedge")
    args = ap.parse_args()

    port = free_port()
    base = f"http://127.0.0.1:{port}"
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    tl = Timeline()
    try:
        for _ in range(40):
            try:
                urllib.request.urlopen(base + "/sudoku.html", timeout=2)
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError("static server did not start")

        with sync_playwright() as p:
            browser = p.chromium.launch(channel=args.channel, headless=True)
            page = browser.new_page(viewport=VIEWPORT, device_scale_factor=SCALE)

            def shot(caption: str, kind: str = "info", ms: int = 250) -> None:
                img = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
                tl.add(with_caption(img, caption, kind), ms)

            def cell(r: int, c: int):
                return page.locator(f'.cell[data-r="{r}"][data-c="{c}"]')

            def play(r: int, c: int, digit: int) -> None:
                cell(r, c).click(force=True)
                page.keyboard.press(str(digit))

            page.goto(base + "/sudoku.html", wait_until="load")
            page.wait_for_timeout(1500)
            shot("Menu: five difficulties, blind mode, light and dark themes, multiplayer", "info", 2600)

            page.click('#mc-solo .diff-btn[data-diff="easy"]')
            shot("Pick a difficulty (Baby to Expert) and press Play", "info", 900)
            page.click("#menu-play-btn")
            page.wait_for_selector(".cell")
            page.wait_for_timeout(700)
            shot("A fresh puzzle: timer, 3 mistakes allowed, 3 hints", "info", 2200)

            state = page.evaluate("({ solution, board: board.map(r => [...r]) })")
            solution, board = state["solution"], state["board"]
            empties = [(r, c) for r in range(9) for c in range(9) if board[r][c] == 0]
            (nr, nc), (wr, wc), (hr, hc) = empties[0], empties[1], empties[2]

            # Notes mode: pencil in two candidates
            cell(nr, nc).click(force=True)
            page.click("#btn-notes")
            for d in (solution[nr][nc], solution[nr][nc] % 9 + 1):
                page.keyboard.press(str(d))
            page.wait_for_timeout(200)
            shot("Notes mode: pencil in candidates", "info", 2000)
            page.click("#btn-notes")

            # A wrong move: red cell, mistake used
            wrong = solution[wr][wc] % 9 + 1
            play(wr, wc, wrong)
            page.wait_for_timeout(450)
            cell(hr, hc).click(force=True)  # move the selection so the flagged cell is visible
            page.wait_for_timeout(300)
            shot("A wrong digit is flagged and uses one of 3 mistakes", "bad", 2600)

            page.click("#btn-undo")
            page.wait_for_timeout(250)
            shot("Undo takes the digit back, but the mistake stays counted", "info", 2200)

            # Hint
            cell(hr, hc).click(force=True)
            page.click("#btn-hint")
            page.wait_for_timeout(300)
            shot("Hint fills in the correct digit (3 per game)", "info", 2200)

            page.click("#nav-theme-btn")
            page.wait_for_timeout(400)
            shot("Dark theme (your settings are remembered)", "info", 1600)

            # Fill in the rest with real clicks and key presses
            todo = [(r, c) for r, c in empties if (r, c) != (hr, hc)]
            for i, (r, c) in enumerate(todo):
                play(r, c, solution[r][c])
                if i % 4 == 0 or i == len(todo) - 1:
                    page.wait_for_timeout(120)
                    shot("The rest of the board, filled in with real clicks and key presses", "info", 160)

            page.wait_for_selector("#win-overlay.show")
            page.wait_for_timeout(600)
            shot("Solved: the timer stops and the win screen shows your time", "good", 3200)
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=10)

    tl.save(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
