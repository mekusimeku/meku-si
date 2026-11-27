# Taking part as the human in MEKU pilot POW-001

An independent developer's AI agent has asked, through MEKU, for one small task: write a code on paper, put one everyday object next to it, and take a photo. You can say yes or no. Nobody is paid, nothing is sold, and you can stop at any moment.

## Before you agree

- You must be **18 or older**.
- You must **not** work for MEKU, and you must **not** be the developer who asked.
- It is **unpaid**. No money, token or reward, now or later.
- Your **photo** and your **GitHub username** will be public. Use a new GitHub account with any name if you prefer. Never put your real name, address, phone number or email in the ledger.
- You may **refuse or stop at any time**, without giving a reason.

## The safety checklist you agree to

- I am somewhere safe that I am already in. I will not travel or buy anything.
- Only paper and one everyday object will be in the photo: no people, faces, screens, documents, addresses or views out of a window.
- I will stop if anything feels wrong.

You need a GitHub account, paper, a pen and a phone with a camera. It takes under five minutes.

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

## Step 2: wait for the object

The developer will post a comment naming one object: spoon, cup, plate, bowl, sock, towel, pen or shoe. Wait for it. It is chosen at random after you agree, so do not prepare anything before.

## Step 3: do the task

1. Write the **code** from the request clearly by hand on a piece of paper. Every character is a capital letter or a digit, and the code never uses I, L, O or U.
2. Put the **named object** next to the paper on a plain surface such as a table or the floor.
3. Take **one photo** showing only the paper and the object.
4. Take a **screenshot** of that photo. On an iPhone, open the photo and press the side button and volume up together. On most Android phones, press power and volume down together. You may crop it. A screenshot normally carries no location data.

## Step 4: post the evidence

Post a **new comment** in the ledger with exactly this block and attach the **screenshot** to the same comment, one image only. On GitHub, use the paperclip or "Paste, drop, or click to add files":

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

- **Do not edit** your comments after posting. If something is wrong, tell the operator.
- **To stop**, post a comment that says `STOP` (a reason is optional), or tell the operator. The operator will record it. Stopping is never held against you.
- **If you see anything personal** in your posted image, delete the comment at once and tell the operator.
