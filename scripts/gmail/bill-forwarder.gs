/**
 * My House — sends Meralco, Manila Water and PLDT bill emails from this Gmail to the app.
 *
 * Runs in the household Gmail's Google Apps Script (script.google.com), every hour. This file is
 * the reference copy kept in the repo; setup: docs/setup.md step 5b. The app side:
 * app/api/bill-email/route.ts (docs/features/email-bills.md).
 *
 * Script Properties (Project Settings → Script Properties — never in this code):
 *   APP_URL            the live app, e.g. https://<address>.vercel.app
 *   BILL_EMAIL_SECRET  the same value as BILL_EMAIL_SECRET in Vercel
 *   NOTIFY_TO          where to send a note when something needs a look (PA's personal Gmail)
 * Set by the script itself: START_DATE, DONE, FAILED_RUNS, LAST_NOTIFIED.
 *
 * Bills forwarded here from PA's personal Gmail (a Gmail filter there) arrive the same way.
 */

// Gmail searches; the subject words keep the billers' promos out.
const SEARCHES = [
  'from:meralco.com.ph subject:bill',
  'from:manilawater.com subject:invoice',
  'from:pldt.com.ph subject:statement',
];
const BILLER_SENDER = /@([\w-]+\.)*(meralco\.com\.ph|manilawater\.com|pldt\.com\.ph)>?\s*$/i;
const LABEL_IMPORTED = 'my-house/imported';
const LABEL_REJECTED = 'my-house/rejected';
const MAX_DONE = 300; // fingerprints of emails already handled (a Script Property holds ~9 KB)

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Run once after pasting the script and setting the Script Properties. Safe to run again. */
function setup() {
  const p = props_();
  for (const key of ['APP_URL', 'BILL_EMAIL_SECRET', 'NOTIFY_TO']) {
    if (!p.getProperty(key)) throw new Error('Set the Script Property ' + key + ' first.');
  }
  // Only bills from now on: older ones were typed in by hand (or are in closed months).
  if (!p.getProperty('START_DATE')) {
    p.setProperty('START_DATE', Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyy/MM/dd'));
  }
  label_(LABEL_IMPORTED);
  label_(LABEL_REJECTED);
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger('run').timeBased().everyHours(1).create();
  console.log('Set up: checking every hour for bills received from ' + p.getProperty('START_DATE') + ' on.');
}

/** The hourly run. */
function run() {
  withLock_(() => process_(false));
}

/** One pass by hand, logging every email it looks at — for setup and checking. */
function testRun() {
  withLock_(() => process_(true));
}

/**
 * Run by hand once whatever made the app refuse a bill is fixed: forgets the emails labelled
 * my-house/rejected, so they're sent again now (logged like testRun). An email the app already
 * has is answered as a duplicate, so sending one twice is safe.
 */
function retryRejected() {
  withLock_(() => {
    const p = props_();
    const forget = [];
    for (const thread of label_(LABEL_REJECTED).getThreads()) {
      for (const message of thread.getMessages()) forget.push(fingerprint_(messageId_(message)));
      thread.removeLabel(label_(LABEL_REJECTED));
    }
    const done = JSON.parse(p.getProperty('DONE') || '[]');
    p.setProperty('DONE', JSON.stringify(done.filter((fingerprint) => forget.indexOf(fingerprint) === -1)));
    console.log('Sending ' + forget.length + ' email(s) from rejected threads again.');
    process_(true);
  });
}

/** One run at a time, so the hourly run and one by hand can't overwrite each other's DONE. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.warn('Another run is still going; try again in a minute.');
    return;
  }
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}

function process_(verbose) {
  const p = props_();
  const appUrl = p.getProperty('APP_URL');
  const secret = p.getProperty('BILL_EMAIL_SECRET');
  const start = p.getProperty('START_DATE');
  if (!appUrl || !secret || !start) throw new Error('Run setup() first.');
  const startDate = new Date(start.replace(/\//g, '-') + 'T00:00:00+08:00');
  const done = JSON.parse(p.getProperty('DONE') || '[]');

  const query = '(' + SEARCHES.map((s) => '(' + s + ')').join(' OR ') + ') after:' + start;
  const rejected = [];
  let failed = 0;

  for (const thread of GmailApp.search(query, 0, 50)) {
    // Done-ness is per message: Gmail labels whole threads, and a new bill can join an old one.
    for (const message of thread.getMessages()) {
      if (!BILLER_SENDER.test(message.getFrom()) || message.getDate() < startDate) continue;
      const messageId = messageId_(message);
      const fingerprint = fingerprint_(messageId);
      if (done.indexOf(fingerprint) !== -1) continue;

      let code;
      let body;
      try {
        const raw = message.getRawContent();
        const response = UrlFetchApp.fetch(appUrl.replace(/\/$/, '') + '/api/bill-email', {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + secret },
          muteHttpExceptions: true,
          payload: JSON.stringify({
            messageId: messageId,
            from: message.getFrom(),
            subject: message.getSubject(),
            receivedAt: message.getDate().toISOString(),
            text: message.getPlainBody(),
            authResults: headers_(raw, 'Authentication-Results')[0] || '',
            // Lets the app trust a bill forwarded from PA's personal Gmail (lib/bill-email/intake.ts).
            arcSeals: headers_(raw, 'ARC-Seal'),
          }),
        });
        code = response.getResponseCode();
        body = response.getContentText();
      } catch (error) {
        code = 0;
        body = String(error);
      }
      if (verbose) console.log(code + ' ' + message.getSubject() + ' → ' + body);

      if (code === 200) {
        done.push(fingerprint);
        thread.addLabel(label_(LABEL_IMPORTED));
      } else if (code === 400 || code === 422) {
        // The app looked and said no: don't send it again (retryRejected() sends it once more).
        done.push(fingerprint);
        thread.addLabel(label_(LABEL_REJECTED));
        rejected.push(message.getSubject() + ' (' + message.getFrom() + '): ' + body);
      } else {
        failed += 1; // wrong secret, app down, network: tried again next hour
        console.warn('Will retry: ' + code + ' ' + message.getSubject() + ' → ' + body);
      }
    }
  }

  p.setProperty('DONE', JSON.stringify(done.slice(-MAX_DONE)));
  const failedRuns = failed > 0 ? Number(p.getProperty('FAILED_RUNS') || 0) + 1 : 0;
  p.setProperty('FAILED_RUNS', String(failedRuns));
  if (rejected.length > 0 || failedRuns >= 3) notify_(rejected, failedRuns);
}

/** A short email to NOTIFY_TO, at most once a day, so a problem isn't silent. */
function notify_(rejected, failedRuns) {
  const p = props_();
  const today = Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyy-MM-dd');
  if (p.getProperty('LAST_NOTIFIED') === today) return;
  const lines = ['The My House bill-email script needs a look.', ''];
  if (rejected.length > 0) {
    lines.push('The app refused these (labelled ' + LABEL_REJECTED + ' in Gmail):');
    for (const line of rejected) lines.push('- ' + line);
    lines.push('');
  }
  if (failedRuns >= 3) {
    lines.push('Sending has failed ' + failedRuns + ' runs in a row (wrong secret, or the app is down?).');
    lines.push('Apps Script → Executions shows the details. It keeps retrying every hour.');
  }
  MailApp.sendEmail(p.getProperty('NOTIFY_TO'), 'My House: bill emails need a look', lines.join('\n'));
  p.setProperty('LAST_NOTIFIED', today);
}

/**
 * Every occurrence of a header, topmost first: for Authentication-Results the first is the one
 * Gmail's own server added when the email arrived here. Only the header block is read, so an
 * attached PDF isn't scanned.
 */
function headers_(raw, name) {
  const head = raw.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
  const prefix = name.toLowerCase() + ':';
  const found = [];
  for (const line of head.split(/\r?\n/)) {
    if (line.toLowerCase().indexOf(prefix) === 0) found.push(line.slice(prefix.length).trim());
  }
  return found;
}

function messageId_(message) {
  return message.getHeader('Message-ID') || 'gmail-' + message.getId();
}

function fingerprint_(messageId) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, messageId, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(digest).slice(0, 16);
}

function label_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
