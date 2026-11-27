# Taking part as the human in MEKU pilot POW-001

An independent developer's AI agent has asked, through MEKU, for one small task: write a code on paper, put one everyday object next to it, and take a photo. You can say yes or no. Nobody is paid, nothing is sold, and you can stop at any moment.

## Before you agree

- You must be **18 or older**.
- You must **not** work for MEKU, and you must **not** be the developer who asked.
- It is **unpaid**. No money, token or reward, now or later.
- Your **photo** and your **GitHub username** will be public. Use a new GitHub account with any name if you prefer. Never put your real name, address, phone number or email in the ledger.
- Before you agree, the operator will ask whether your GitHub username may be named in the ledger. It appears there when the task is offered to you, together with whether you have a MEKU human profile and how the operator contacted you (for example "message").
- Do not rename your GitHub account until the pilot report is published. Tap **Subscribe** on the ledger issue so that GitHub emails you a copy of every comment.
- You may **refuse or stop at any time**, without giving a reason.

## The safety checklist you agree to

- I am somewhere safe that I am already in. I will not travel or buy anything.
- Only paper and one everyday object will be in the photo: no people, faces, screens, documents, addresses or views out of a window.
- I will stop if anything feels wrong.

You need a GitHub account, paper, a pen and a phone with a camera. It takes under five minutes.

## Before you start: a dry run of your screenshot

Some phones add hidden data to images, and the pilot can only use a screenshot that carries none. So the operator will ask you to test your phone once, before the pilot starts:

1. Take a photo of a **blank** sheet of paper, with nothing else in the picture.
2. Make a screenshot of it exactly as step 3 below describes.
3. Before posting, open the screenshot in your photo app and swipe up on it. If you see a map or a place name, the image carries a location: do not post it, and tell the operator.
4. In the dry-run issue the operator sends you, post one comment with the evidence block from step 4 below and that screenshot attached, exactly as you will in the ledger, from the same phone and the same app or browser.

Anything you post on GitHub is public at once, so post only the screenshot of the blank page, never the photo itself. Your GitHub username appears on that issue. The operator has the image checked and tells you whether it passed, and also checks that your comment can be seen by others: GitHub sometimes hides comments from brand-new accounts. If the check did not pass, the operator will suggest another way to make the screenshot, and you try again.

## What the request says

The developer's request, as MEKU stored it, is in the ledger's seq 4 record, in the field `description`, on one long line. Here is the same text, word for word, in shorter lines. `CODE` stands for the request's 8-character code and `LEDGER` for the ledger's address. The request is titled "POW-001: handwritten code photo (unpaid pilot)".

> MEKU POW-001 independent proof-of-work pilot.
> Unpaid: no payment, token or wallet of any kind.
> Code: CODE.
> If you freely agree:
> (1) handwrite the code CODE on paper;
> (2) after you post your consent in the public record, the developer will post 2 more characters to write after the code and name one everyday object; place that object next to the paper;
> (3) take one photo showing only the paper and the object on a plain surface - no people, faces, screens, documents, addresses or windows;
> (4) post a screenshot of that photo in the public record (screenshots normally carry no location data).
> Under 5 minutes, at a place you already are.
> No travel, purchase or special equipment.
> You may refuse or stop at any time without penalty.
> Public record: LEDGER

If the text in seq 4 says anything else, do not agree, and tell the operator.

## Step 1: say yes

The MEKU operator will send you the link to the ledger (a GitHub issue). Read the request there. If you agree, post a **new comment** in the ledger containing exactly this block, all of it, unchanged:

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": 6,
  "type": "human_consent",
  "role": "human",
  "consents": {
    "voluntary_participation": true,
    "may_reject_or_stop": true,
    "responsible_for_safety": true,
    "safety_checklist": true
  },
  "adult_18_plus": true,
  "unpaid_understood": true,
  "publication": {
    "photo_public": true,
    "github_login_public": true
  },
  "independence": {
    "not_meku_staff_or_contractor": true,
    "not_the_developer": true
  }
}
```

On a phone, tap the copy button on the block and paste it as your whole comment. Pasting the bare block is fine; the lines of three backticks around it are optional. Posting it means: I take part voluntarily; I know I may refuse or stop; I am responsible for my own safety; I follow the safety checklist above; I am 18 or older; I understand it is unpaid; my photo and GitHub username may be public; I do not work for MEKU and I am not the developer.

## Step 2: wait for the object and 2 characters

The developer will post a comment whose first line says, for example, `write K7QX29MDA4 and put a SPOON next to it`. It names one object (spoon, cup, plate, bowl, sock, towel, pen or shoe) and 2 more characters to write after the code. Wait for it. Both follow from your consent comment, so nobody can know them before you agree.

## Step 3: do the task

1. Write the **code** from the request and, right after it, the **2 characters** from the developer's comment, clearly by hand on a piece of paper: 10 characters on one line. Every character is a capital letter or a digit, never I, L, O or U.
2. Put the **named object** next to the paper on a plain surface such as a table or the floor.
3. Take **one photo** showing only the paper and the object.
4. Take a **screenshot** of that photo, the same way as in the dry run. Open the photo and tap it once so the buttons and the bar with the time disappear. On an iPhone, press the side button and volume up together. On most Android phones, press power and volume down together. If the bar with the time is still visible, crop it away. A screenshot normally carries no location data, and the verifier checks the file anyway.

## Step 4: post the evidence

Post a **new comment** in the ledger with exactly this block and attach the **screenshot** to the same comment, one image only, and write nothing else in it. The block counts only together with its screenshot. On GitHub, use the paperclip or "Paste, drop, or click to add files":

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": 8,
  "type": "evidence_submitted",
  "role": "human",
  "statements": {
    "code_physically_written": true,
    "object_placed_after_reveal": true,
    "no_people_or_personal_data": true,
    "metadata_removed": true
  },
  "evidence": "attached-in-this-comment"
}
```

Post it within 48 hours of the object being named. If you forgot the screenshot, post the block again with the screenshot attached. Post only one screenshot: a second, different one would contradict the first, which the operator may already have checked, and the pilot could not pass. If you attached the wrong one, do not post another; tell the operator. That is all; the operator and the developer do the rest.

## Important

- **Never edit or delete** your comments. If something is wrong, post a new comment or tell the operator. An edited comment stops the pilot from passing unless a stop is recorded, because its first version might have said stop. If a block was not accepted (for example, you added words to it), post the block again, alone, in a new comment; for the evidence, attach the same screenshot again.
- **To stop**, post a comment that says only `STOP` (or only 🛑), or tell the operator. The same word in many other languages also counts, for example berhenti, batal, arrête, 停止, やめて or 그만. A comment like that prevents the pilot from passing until a stop is recorded, even after the pilot has closed. If you want to give a reason, post it in a second comment. Everything you write in the ledger is printed in full for the people who check the pilot, so a request to stop in any other words is also seen. Stopping is never held against you.
- **Post no other images** in the ledger. Every image a participant posts is checked, and one that carries a location fails the whole pilot.
- **If one of your comments ever disappears,** tell the developer, who is not part of MEKU. GitHub's notification emails keep your own copy of every comment (see **Subscribe** above).
- **If you see anything personal** in your posted image, tell the operator at once. Deleting the comment hides it, but the uploaded image stays reachable at its address until GitHub Support removes it. The operator will ask GitHub Support to remove it.
