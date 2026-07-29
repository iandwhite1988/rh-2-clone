# repo-publisher

A Claude Code plugin for the workflow where **you paste code and Claude puts it
in GitHub**. It is built around the ways that job actually goes wrong, rather
than the ways it looks like it might.

Three failures it exists to prevent:

- **Code that does not fit the repo.** Pasted files are often written against a
  different version of the project — a planned refactor, or an architecture
  another tool assumed. It reads as good code, lands cleanly, and breaks
  something else entirely.
- **A push that quietly did not happen.** Leave one file out of a hand-assembled
  push and the request still succeeds. The repo keeps the old version while the
  commit message says otherwise.
- **"It builds" mistaken for "it works."** A missing module, a constructor that
  throws on the first frame, or a null element gives you a blank page and a
  clean build.

## Contents

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `publish-pasted-code` | The end-to-end workflow: classify, fit-check, push, verify, smoke-test, report |
| Skill | `architecture-fit-check` | Compares an incoming file's contract against every file that imports it |
| Skill | `browser-smoke-test` | Loads the page in headless Chromium and captures errors, boot state, FPS, screenshot |
| Agent | `github-publisher` | Sonnet. Writes files to GitHub and proves byte-for-byte that they landed |
| Agent | `integration-reviewer` | Sonnet. Read-only. Reports whether incoming code fits before anything is overwritten |
| Command | `/publish` | Runs the whole workflow on the code in the conversation |

## Install

Copy the directory into a plugin location Claude Code reads, or add the repo
containing it as a marketplace and enable it with `/plugin`.

```bash
cp -r repo-publisher ~/.claude/plugins/
```

Then check it loaded:

```
/plugin
```

## Use

Paste code and say where it goes:

```
Replace src/renderer.js with this: <paste>
```

Or run the command explicitly:

```
/publish into iandwhite1988/rh-2-clone on main
```

The skills also trigger on their own when you paste code with publishing
intent, so you do not have to remember the command.

## What it will not do for you

Creating repositories and changing repository visibility are frequently blocked
by sandbox proxies. The plugin's guidance is to quote the real error and hand
you the exact settings URL rather than retrying or reporting a vague failure.
Those two steps stay manual.

Likewise, it never claims code *works* on the strength of a successful push.
Publishing and working are separate claims, and it only makes the second one
after watching the page run.
