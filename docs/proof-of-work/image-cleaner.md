# Image cleaner for POW evidence

The image cleaner is a single web page, [`tools/pow/clean-image.html`](../../tools/pow/clean-image.html). It removes all data outside the pixels from a picture, on the phone, and saves what the screen shows as a clean PNG. Nothing is uploaded.

**Why it exists.** On 28 November 2026, during the founder's phone testing, cropped and uncropped iPhone screenshots alike carried EXIF and Photoshop metadata. The evidence check refuses both, so a screenshot alone is not enough on an iPhone. In POW-001 every evidence screenshot goes through the cleaner before it is posted, on every phone.

## What it does

1. It reads the chosen file on the phone. The file is never sent anywhere.
2. It draws the picture exactly as the browser shows it: the right way up, with its colours converted to sRGB.
3. It saves that drawing as a PNG and keeps only the chunks that hold the picture: `IHDR`, `PLTE`, `tRNS`, `IDAT` and `IEND`. Nothing after the end of the file is kept.
4. It checks the result. A blank picture, all one colour, is refused. The saved file's pixel data must be complete: it must unpack to exactly the size its header promises. The file is read back and compared with the drawing, pixel by pixel; every pixel must be within 3 of 255.
5. It runs the evidence image check on the file. This check is a verbatim copy of the scanner in `tools/pow/lib.mjs`, the same code that `record.mjs check-image` and the verifier run.
6. It says **Ready to post** only if the check finds no `FAIL`, the pixel data is complete and the pixels match. Only then is **Save clean PNG** offered, and what it saves is exactly the file that was checked.

**What it removes:**
- EXIF, including GPS location;
- XMP;
- Photoshop and IPTC data;
- colour profiles and colour tags;
- text notes, time stamps and pixel density;
- Apple's layout chunk;
- extra pictures stored after a JPEG;
- anything else outside the pixels.

**What it keeps:** the picture's size and orientation as shown, its transparency, and its colours as sRGB.

## Privacy

- **No network.** The page makes no network requests. It has no request code, loads nothing from outside (scripts, styles, fonts or images), stores nothing and tracks nothing.
- **How that is checked.** The tests below check the page's code for this, and the browser test runs it under a content security policy that blocks all network access. claude.ai's published rules for its pages also block requests to other sites; this work does not test that.
- **Where the page itself comes from.** The page has to be loaded from somewhere. For now, the founder opens it as a private page on claude.ai. Loading the page is an ordinary web request to that host; the picture is never part of it.
- **For participants**, MEKU decides where the page lives: either the founder shares that claude.ai page, or MEKU hosts the same file on a site it controls.
- **Checking the copy.** Whichever host is used, it must be this exact file. The footer's scanner id names only the check's code, not the whole page. The page is identified by its SHA-256, which `node tools/pow/build-clean-image.mjs --check` prints at the approved commit. Download the hosted copy and compare its SHA-256 with that before sending its link to anyone.

## The page's check is the evidence check, never weaker

- **Built from the scanner.** `tools/pow/build-clean-image.mjs` builds the page from three files: `clean-image.template.html`, `clean-image-core.mjs`, and the scanner section of `lib.mjs`, copied word for word.
- **CI keeps them in step.** CI runs `build-clean-image.mjs --check` and fails if the committed page differs. So a change to the scanner cannot leave the page behind.
- **Same answers.** `tools/pow/clean-image.test.mjs` runs the page's copy of the check and `scanImage` on 44 files. The files cover every finding the scanner can give, and both give identical results.
- **The one difference.** The page cannot unpack compressed metadata (a compressed colour profile or compressed XMP), so it refuses such files. That makes it stricter, never weaker. A cleaned file never holds compressed metadata.
- **The page is not the final check.** Its verdict helps the participant. The check that counts is still the operator's `check-image` on the posted attachment, before the ledger opens and again before seq 9.

## Using it on an iPhone

1. Open the cleaner page in Safari.
2. Tap **Choose the screenshot** and pick it from Photos or Files.
3. Wait for **Ready to post**. Under **Removed from the original**, the page lists what it took out.
4. Tap **Save clean PNG**.
   - In Safari, confirm the download. The file is then in **Files → Downloads**.
   - If a share sheet opens, as in the Claude app, choose **Save to Files**, not **Save Image**.
5. In the GitHub comment, tap the paperclip, then **Choose File**, and pick the file named `pow-clean-xxxxxxxx.png`. **Never attach the picture from Photos:** when a picture is picked from Photos, the phone can turn it into a JPEG and add hidden data again.

**Checking the browser itself.** **Check this phone's browser → Run the check** builds two test pictures full of hidden data (EXIF with GPS, XMP naming a place, Photoshop data, notes) and confirms four things on this device:
- the check refuses the test pictures;
- the cleaned copies pass;
- their pixels are unchanged;
- only pixel data is left.

All five lines must say *passed*.

## Limits

- **Colour.** Colours outside the sRGB range, such as very saturated Display P3 reds, are mapped to the nearest sRGB colour. The handwriting and the object stay as they are.
- **Size.**
  - Pictures over about 8.4 million pixels are refused, to keep the phone's memory use low; screenshots are far smaller (the largest iPhone screenshot has 3.8 million pixels), and photos should not be posted anyway.
  - A clean file over 10 MB fails the check. Crop the screenshot closer to the paper and the object.
- **Fingerprinting protection.** Safari can add faint noise when a page reads its canvas. The page compares the saved pixels with what it drew, and the self-test does the same on the device. So any noise shows as **Not ready**; it cannot slip through. If that happens, tell the operator; do not look for another way to save the picture.
- **HEIC.** Safari opens HEIC pictures; Chrome on a computer does not.

## Files and tests

| File | What it is |
| --- | --- |
| `tools/pow/clean-image.html` | The page. Generated: do not edit it by hand. |
| `tools/pow/clean-image.template.html` | The page's layout and browser code. |
| `tools/pow/clean-image-core.mjs` | The cleaning code, shared by the page and the tests. |
| `tools/pow/build-clean-image.mjs` | Builds the page; `--check` fails if the committed page is out of date. |
| `tools/pow/clean-image.test.mjs` | Node tests, run in CI: the page's check equals `scanImage`, cleaning, file structure, no network code. |
| `tools/pow/clean-image.e2e.mjs` | Browser test with Playwright, Chromium and sharp, run by hand. It serves the page under a no-network policy, opens it as an iPhone (viewport, touch, user agent), cleans realistic phone pictures, saves each through the page's own button, and checks each saved file with `scanImage` and against the original's pixels. |

**Results so far.** The browser test was run in Chromium, emulating an iPhone 15 Pro, on 28 November 2026.
- **Inputs.** Seven pictures, five of them realistic phone pictures:
  - an iPhone-style screenshot with a Display P3 profile, EXIF with GPS, XMP, density and a time stamp;
  - a cropped, edited JPEG with EXIF and GPS, Photoshop data, XMP, a profile and a comment;
  - a sideways photo with an orientation tag;
  - a picture with transparency;
  - a screenshot the size of the largest iPhone screen;
  - a picture too small for evidence, and a blank one: both must be refused.
- **Outcome.** The page refused the small and the blank picture, with nothing offered to save. Every saved file passed `scanImage` with no finding at all. Each had the expected size, with the sideways photo upright. Pixels matched the original within 1 level out of 255.
- **Network and self-test.** The page made no request outside its own address, and the self-test passed.

**Not yet tested:** Chromium is not Safari. The first run on a real iPhone is the founder's assisted dry run (see [dry runs](dry-runs.md)).
