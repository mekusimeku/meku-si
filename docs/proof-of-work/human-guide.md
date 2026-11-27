# Taking part as the human in MEKU pilot POW-001

An independent developer's AI agent has asked, through MEKU, for one small task: write a code on paper, put one everyday object next to it, and take a photo. You can say yes or no. Nobody is paid, nothing is sold, and you can stop at any moment.

## Before you agree

- You must be **18 or older**.
- You must **not** work for MEKU, and you must **not** be the developer who asked.
- It is **unpaid**. No money, token or reward, now or later.
- Your **photo** and your **GitHub username** will be public. Use a new GitHub account with any name if you prefer. Never put your real name, address, phone number or email in the ledger.
- Before you agree, the operator will ask whether your GitHub username may be named in the ledger. It appears there when the task is offered to you.
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
3. Post that screenshot as a comment in the dry-run issue the operator sends you, from the same phone and the same app or browser you will use later.

The test image shows only a blank page. Your GitHub username appears on that issue. The operator has the image checked and tells you whether it passed. If it did not, they will suggest another way to make the screenshot, and you try again.

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

Post a **new comment** in the ledger with exactly this block and attach the **screenshot** to the same comment, one image only, and write nothing else in it. On GitHub, use the paperclip or "Paste, drop, or click to add files":

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

Post it within 48 hours of the object being named. That is all; the operator and the developer do the rest.

## Important

- **Never edit or delete** your comments. If something is wrong, post a new comment or tell the operator. An edited comment stops the pilot from passing, because its first version might have said stop.
- **To stop**, post a comment that says only `STOP` (in any language, or only 🛑), or tell the operator. A comment like that prevents the pilot from passing until the operator records your stop. If you want to give a reason, post it in a second comment. Everything you write in the ledger is read by the people who check the pilot. Stopping is never held against you.
- **If you see anything personal** in your posted image, tell the operator at once. Deleting the comment hides it, but the uploaded image stays reachable at its address until GitHub Support removes it. The operator will ask GitHub Support to remove it.
