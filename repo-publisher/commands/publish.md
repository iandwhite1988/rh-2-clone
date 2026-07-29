---
description: Publish pasted code to a GitHub repo with fit-checking and post-push verification
---

Publish the code from the conversation into the target repository.

Follow the `publish-pasted-code` skill. In short:

1. Work out what you were handed — a whole file, a fragment that belongs inside
   an existing file, several files, or a directory tree describing a layout.
2. If it replaces a module other files import from, run `architecture-fit-check`
   (or delegate to the `integration-reviewer` subagent) before overwriting
   anything. Report a mismatch rather than publishing through it.
3. Push, listing the paths you intend to send and checking that list against
   the files you were actually given.
4. Read every file back from the remote and diff it against your local copy.
   A push that returns success has not proven anything landed.
5. For web projects, run `browser-smoke-test` against the published copy before
   saying it works.

Report the paths, the links, anything you changed in their code and why, and
anything the environment blocked along with the manual step that unblocks it.

$ARGUMENTS
