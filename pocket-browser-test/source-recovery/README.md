# MEKU Pocket — EXACT original v9 source recovery kit

**November 5, 2026.** This kit helps retrieve the **original saved v9 app** only from the original project workspace. It is NOT that app. No test source, older site, or current website should be substituted for v9.

## Facts verified before writing this tool

- The missing original Pocket v9 Git commit is `cdda79046ec97bdcd219fcc2f963a252aeef7ea4` (previously reported with 74 tests). The connected GitHub repositories do not have this commit.
- Earlier Pocket Work/Sites source ran in a local workspace identified in prior project history as `/workspace/scratch/43f5c66538f1`; the folder is **NOT accessible in the current session**. Opening the original ChatGPT Work task may restore the source in its own cloud workspace. This exact path is a **lead**, not a verified current location for v9.
- The accessible ChatGPT Library Sites alias `MEKU Pocket Demo.txt` points to saved **source version 8**, using `0.6.0-chain-link`; it does not establish ownership of exact v9.
- Lovable `Pixel Perfect Preview` is the MEKU SI website, not Pocket v9. `mekusimeku/meku-si` contains separate test-only PRs; do not merge them to claim the missing app is ready.

## Recover in the original Pocket Work session

1. Open **the original MEKU Pocket ChatGPT Work project/task** where v9 was built. Ask that session to inspect its exact saved repository/working directory; an earlier source workspace lead is `/workspace/scratch/43f5c66538f1`.
2. If it can run shell commands, upload or copy `recover-exact-v9.sh` there and run:

   ```bash
   bash recover-exact-v9.sh --repo /path/to/original/Pocket/repo
   ```

3. It will look up the **immutable exact commit** in Git, not a branch name. If the exact commit is missing, it fails with `NOT FOUND` and exports nothing. If found, it creates a ZIP, `MANIFEST.txt` with exact Git commit/tree and ZIP SHA256, and the raw commit object in a private temp directory outside the source.
4. Download/export the ZIP + manifest privately and attach them to this conversation. Do not upload private code or key material to a public issue. After successful recovery, compare the app's package/test files to the v9 checkpoint, run the existing 74 tests from original sources, and only then plan integration.

This tool does not recover an unavailable workspace by itself, search other computers, install dependencies, contact services, ask for or handle wallet words, change Git refs, merge, deploy, sign, or move funds. **Never fund or run Stage 19–21 test-only code as a production wallet.**

## Local offline test

```bash
python3 -m unittest -v test_recovery.py
```

The tests create a disposable local Git repository and *only in a test copy* replace the expected v9 hash with its dummy commit. The actual recovery script is never modified. Tests cover exact export, later HEAD drift, fail-closed missing commit, no overwrite, no project-tree writes, non-Git input, and ZIP/manifest integrity. A passing test proves only that the recovery **procedure** works, not that the missing v9 commit is present.
