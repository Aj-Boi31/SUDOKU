import anthropic
import base64
import json
from pathlib import Path
import pyautogui

client = anthropic.Anthropic()
PROJECT_DIR = Path(__file__).parent


def take_screenshot():
    img = pyautogui.screenshot()
    img = img.resize((1280, 800))
    img.save(PROJECT_DIR / "_screenshot.png")
    with open(PROJECT_DIR / "_screenshot.png", "rb") as f:
        return base64.standard_b64encode(f.read()).decode()


def read_file(path: str) -> str:
    return (PROJECT_DIR / path).read_text(encoding="utf-8")


def write_file(path: str, content: str) -> str:
    (PROJECT_DIR / path).write_text(content, encoding="utf-8")
    return f"Written {path}"


def edit_file(path: str, old: str, new: str) -> str:
    text = (PROJECT_DIR / path).read_text(encoding="utf-8")
    if old not in text:
        return f"ERROR: string not found in {path}"
    (PROJECT_DIR / path).write_text(text.replace(old, new, 1), encoding="utf-8")
    return f"Edited {path}"


TOOLS = [
    {
        "name": "take_screenshot",
        "description": "Capture what is currently visible on screen (browser, editor, etc.)",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "read_file",
        "description": "Read a project file. Available files: sudoku.html, sudoku.css, sudoku.js",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Filename, e.g. sudoku.css"}},
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Overwrite an entire file with new content. Use only for large rewrites.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "edit_file",
        "description": "Replace an exact string in a file. Preferred for small targeted changes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "old": {"type": "string", "description": "Exact text to find (must be unique in file)"},
                "new": {"type": "string", "description": "Replacement text"},
            },
            "required": ["path", "old", "new"],
        },
    },
]

SYSTEM = (
    "You are a front-end coding agent working on a Sudoku web app. "
    "The project files are sudoku.html, sudoku.css, and sudoku.js. "
    "You can see the user's screen via screenshots and edit code files directly. "
    "Always take a screenshot first to see the current state. "
    "Read a file before editing it. Use edit_file for small changes, write_file only for complete rewrites. "
    "After making changes, tell the user what you changed and to refresh their browser."
)


def run_tool(name, inputs):
    if name == "take_screenshot":
        data = take_screenshot()
        print("  [screenshot taken]")
        return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}]
    elif name == "read_file":
        content = read_file(inputs["path"])
        print(f"  [read {inputs['path']} — {len(content)} chars]")
        return content
    elif name == "write_file":
        result = write_file(inputs["path"], inputs["content"])
        print(f"  [{result}]")
        return result
    elif name == "edit_file":
        result = edit_file(inputs["path"], inputs["old"], inputs["new"])
        print(f"  [{result}]")
        return result


def run_agent(task: str):
    screenshot_data = take_screenshot()
    print("[screenshot taken — sending to Claude...]\n")

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": screenshot_data},
                },
                {
                    "type": "text",
                    "text": f"This is a screenshot of my Sudoku web app. Task: {task}",
                },
            ],
        }
    ]

    while True:
        response = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=16000,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
        )

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            for block in response.content:
                if hasattr(block, "text"):
                    print("\nAgent:", block.text)
            break

        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                short_input = json.dumps(block.input)[:60]
                print(f"→ {block.name}({short_input})")
                result = run_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result if isinstance(result, list) else str(result),
                })

        messages.append({"role": "user", "content": tool_results})


if __name__ == "__main__":
    print("Sudoku Agent — make sure your browser is visible on screen.\n")
    task = input("What should the agent fix or change? > ")
    print()
    run_agent(task)
