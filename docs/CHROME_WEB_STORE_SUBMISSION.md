# LeetAlly Chrome Web Store submission

Use this copy in the Chrome Web Store dashboard and keep it synchronized with
the shipped manifest, product UI and Privacy Policy.

## Release details

- Chrome Web Store item ID: `kbmamkkghfaagfplfdgpdocmgakhjmlo`
- Publisher/product name: LeetAlly
- Operator location: India
- Availability: all Chrome Web Store regions selected by the publisher
- Paid features at launch: disabled
- Public support, privacy, security and grievance email:
  `watershaper9.1@gmail.com`

## Single purpose

LeetAlly helps users practise technical interviews on supported LeetCode problem
pages by providing an AI interviewer, evidence-based feedback and preparation
progress tracking.

## Short description

Practice LeetCode with an AI interviewer and track interview preparation progress.

## Detailed description

LeetAlly turns a supported LeetCode problem into a structured practice interview.
The extension asks follow-up questions, listens only after you start a session,
tracks relevant problem and editor context, and produces an evidence-based
practice scorecard.

Main features:

- Voice-led DSA, behavioural, low-level-design and high-level-design practice.
- Explicit disclosure and consent before page, editor or microphone data is used.
- On-device voice-activity detection so silence is not intentionally uploaded.
- Company-focused preparation lists and progress tracking.
- Account sync, interview history and self-service data export/deletion.

LeetAlly is for authorised practice only. It is not affiliated with LeetCode and
must not be used during real interviews, proctored assessments or competitions.
AI feedback may be inaccurate and does not represent an employment decision.

## Permission justifications

### storage

Stores authentication sessions, recorded policy acceptance, preferences,
selected preparation sheets, progress and recent practice scorecards on the
user's device.

### identity

Completes the user-initiated Supabase/Google authentication flow through
Chrome's protected identity redirect URL. It is not used for passive identity
collection.

### https://leetcode.com/* and https://www.leetcode.com/*

Runs the visible LeetAlly interface on supported problem pages and, only after
recorded disclosure/consent, reads the current problem, editor language/code and
visible run output required for interview practice and progress tracking. It also
queries the signed-in user's LeetCode GraphQL data when profile sync is enabled.

### https://leetally-api.vercel.app/*

Sends authenticated interview requests, detected speech segments, context,
feedback and account-rights requests to the LeetAlly backend over HTTPS.

### https://wfpiyxepzmocwuowiadw.supabase.co/*

Provides account authentication and user-owned progress synchronization through
the production LeetAlly Supabase project only.

### https://raw.githubusercontent.com/*

Downloads CSV preparation-list data that is parsed strictly as data. Nothing
downloaded from this host is executed as JavaScript, WebAssembly or extension code.

## Remote code declaration

Select **No, I am not using remote code**. All executable JavaScript, WebAssembly,
voice-activity models and worklets are packaged in the extension. The extension
fetches HTTPS API responses and preparation CSV data, but never evaluates or
executes those responses as code.

## Data-use disclosure selections

Disclose the following categories:

- Personally identifiable information: email, display name, account identifier,
  optional LeetCode username and profile image.
- Authentication information: Supabase session tokens stored in extension local
  storage.
- Website content: current supported problem text, editor language/code, visible
  output, problem URL/slug and topic/company signals.
- User activity: solved-problem progress, selected sheets, accepted friend
  connections and interview activity.
- User-generated content and personal communications: voice segments,
  transcripts, interview answers, code revisions and feedback.
- Financial/payment information: do **not** select this category for the initial
  release because billing and checkout are disabled. Add it before enabling paid
  plans; LeetAlly must never receive full payment credentials.

Certify that data is used only for the disclosed single purpose, is not sold, is
not used for targeted advertising or lending, and is transferred only to the
processors required to provide, secure or legally operate the service.

## Reviewer test instructions

1. Install the submitted build and open `https://leetcode.com/problems/two-sum/`.
2. Open LeetAlly settings. Review and accept the visible data disclosure.
3. Sign in with the reviewer account supplied in the private test-instructions tab.
4. Choose DSA and press Start. Allow microphone access when Chrome asks.
5. Speak a short approach. Confirm the transcript and AI follow-up appear.
6. End the interview and confirm a scorecard appears in the extension popup.
7. In Friends, add a second reviewer account by email and confirm progress stays
   hidden until that account accepts the request.
8. Open the website account dashboard to test data export and sign-out.

Provide a dedicated reviewer account with a confirmed email and enough trial or
paid entitlement to complete the steps. Never place credentials in the public
listing description.

## Required listing assets

- Store icon: `extension/public/icon/128.png` (128×128).
- Small promotional tile: `website/store-assets/promo-440x280.png` (440×280).
- One to five real extension screenshots in
  `website/store-assets/screenshots/` (1280×800 preferred).
- Support URL, homepage URL and public Privacy Policy URL.
