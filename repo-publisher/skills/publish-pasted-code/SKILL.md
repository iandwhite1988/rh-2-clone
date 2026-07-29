---
name: publish-pasted-code
description: Publishes code the user pasted into a chat message into a GitHub repository, safely and verifiably. Use this whenever the user pastes a file, a diff, a snippet, or a directory tree and wants it committed, pushed, added, or "put in the repo" — including phrasings like "replace src/foo.js with this", "here's the updated version", "here's the finished code", "add this to GitHub", "push this", or when they paste code with no instruction at all but the running task is clearly to publish it. Also use it when the user says another AI or teammate wrote the code and your job is just to post it.
---

# Publishing pasted code

The user hands you code and expects it to end up in a repository, working. The
job looks like "copy text into a file and push" but the failures are almost
never in the copying — they are in publishing something that does not fit the
repo, or believing a push succeeded when it silently did not.

Work through these five steps. They are ordered so that the cheap checks catch
problems before the expensive ones.

## 1. Classify what you were actually given

Before touching the repo, decide which of these you have, because each is
published differently:

- **A complete file.** It has the imports/exports or opening tags a standalone
  file needs. This can replace a path directly.
- **A fragment.** A bare `<div>`, a single function, a CSS block. It has no
  home of its own — it belongs *inside* an existing file. Publishing it as its
  own file is almost always wrong. Find the file it belongs in, or ask which
  one, rather than inventing `sidebar.html` and hoping.
- **Several files in one message.** Publish them in a single commit so the repo
  is never in a half-updated state where one file references another that has
  not landed yet.
- **A directory tree.** This is usually the user describing the layout they
  want, not files to create. Read it as a target structure and reconcile the
  repo against it.

If the user names a path ("replace src/renderer.js"), take it seriously but
still run step 2 — a named path is a statement of intent, not proof of fit.

## 2. Check it fits before you overwrite anything

Pasted code is frequently written against a *different version* of the project
than the one in the repo — a refactor the user is planning, an architecture
another tool assumed, or an older layout. Dropping it in then produces a repo
that looks updated and is actually broken.

Run the `architecture-fit-check` skill before replacing any file that other
files import from. It takes under a minute and catches the expensive class of
mistake.

If the check finds a mismatch, say so plainly and stop before overwriting.
Report the specific incompatibility ("this exports a `Renderer` taking
`(game)`, but `main.js` constructs it with `(canvas, minimap, game)` and calls
`.render()`, which this version does not define"), then offer the options: write
the missing glue, adapt the code, or publish it somewhere it does not break the
existing entry point. Let the user choose — they may be mid-refactor and know
exactly what they are doing.

## 3. Publish

Prefer `git` when the working tree is a clone of the target repo and pushes are
permitted. Otherwise use the GitHub API file-push tooling.

Two things that reliably go wrong:

**Omitting a file from a multi-file push.** When you assemble a push by hand,
it is easy to leave one file out of the list. The push succeeds, so nothing
looks wrong, but the repo keeps the old version of the missing file and the
commit message claims otherwise. Before pushing, list the paths you intend to
send and compare that list against the files the user actually gave you.

**Destroying work that was not yours to remove.** If publishing means
overwriting or deleting something already in the repo, look at what is there
first. If you did not write it, or it contradicts how it was described, surface
that instead of proceeding. Moving a file aside is nearly always better than
deleting it, and it is trivially reversible.

Write commit messages that describe the change, not the process. If you fixed
something in the user's code, say what and why in the commit body — that is the
record the next reader gets.

## 4. Verify it actually landed

A successful API response means the request was accepted, not that the
repository now contains what you meant to send. Re-read the files back from the
remote and compare them against your local copies byte-for-byte.

```bash
curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github.raw" \
     "https://api.github.com/repos/OWNER/REPO/contents/PATH" -o /tmp/remote-PATH
diff /tmp/remote-PATH LOCAL_PATH && echo "match"
```

A size mismatch is the fastest tell that a file did not update. If the diff
shows a file you *intended* to change is still the old version, you omitted it
from the push — send it and verify again.

## 5. Smoke-test before saying it works

Syntax checks and green builds do not prove the thing runs. For anything
web-facing, run the `browser-smoke-test` skill against the *published* copy —
not your local working tree, since only the published copy is what the user and
their deploy see.

This is what separates "I pushed it" from "it works". Both statements are worth
making, but only say the second one when you have watched it happen.

## Reporting back

Lead with what landed and where, then the links. State plainly:

- What was published, and to which paths
- Anything you changed in their code, and why — never quietly fix a bug in
  pasted code without saying so, because they will keep the broken version in
  their own source and re-send it
- What you verified, and what you could not
- Anything blocked by the environment, with the exact manual step that unblocks
  it. Creating repositories and changing repository settings such as visibility
  are commonly blocked by sandbox proxies; when they are, give the user the
  settings URL rather than reporting a vague failure.

Keep it short. The user wants the link and the confidence, not the transcript.
