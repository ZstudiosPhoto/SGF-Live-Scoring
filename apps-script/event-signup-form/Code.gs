// ============================================================
// SGF Saturday Golf Friends -- Event Signup Web App
// Google Apps Script -- Code.gs
// ============================================================

const SPREADSHEET_ID = '1xJF3G0oPOeRRuYEVXaTxhMjNAKwzm7bH9X3mcmeB3Tk';
const SHEET_NAME     = 'CurrentUpcoming Rounds';
const WEB_APP_URL    = 'https://script.google.com/macros/s/AKfycbzN8U048Qs2T_z8srNQX3hTZVwc8AcBw2_k3EV7FVFchoAqIkG8TTAUJvwH6L1tvw8e/exec';
const SGF_SITE_URL   = 'https://www.saturdaygolffriends.com';
const SGF_ADMIN      = 'chris@zstudios.com';
const SGF_REPLY_TO   = 'golf@zstudios.com';

// Column indices (0-based)

const COL_TEE_TIME   = 0;  // A: date (event header) or tee time (player row)
const COL_PLAYER     = 1;  // B: course (event header) or player name (player row)
const COL_EMAIL      = 2;  // C: (unused - kept for reference only)
// Col O no longer used for tokens - tokens live in the hidden SGF_CancelTokens sheet
const TOKENS_SHEET   = 'SGF_CancelTokens'; // hidden sheet: Token | PlayerName | EventDate | Course | TeeTime | Email
const COL_TEE        = 5;  // F: tee color
const COL_INDEX      = 6;  // G: handicap index
const COL_COURSE_HCP = 7;  // H: course handicap (player rows) / Pay REQ'D (event header rows)
const COL_PAY_REQ    = 7;  // H: Pay REQ'D on event header rows
const HIO_SHEET_NAME = 'Hole In One Club';
const COL_HIO        = 9;  // J: HIO club member flag (auto-set on signup)
const ONLINE_SIGNUP_COLOR    = '#d9ead3';  // pale green: golfer signed HIMSELF up on the form
const ORGANIZER_SIGNUP_COLOR = '#cfe2f3';  // pale blue: the organizer entered him (he texted/emailed)
const ORGANIZER_CODE         = 'SGF2026C'; // passcode the organizer types instead of the golfers' SGF2026

// ============================================================
// !! EMAIL TEXT RULE - PLEASE READ BEFORE EDITING !!
// Keep every SUBJECT line and every PLAIN-TEXT body ASCII-only.
// Em dashes, curly quotes, arrows and similar characters have been
// arriving mangled (an em dash showed up in players' inboxes as "a EUR ").
// Use a plain hyphen or a colon in subjects and plain text.
// In htmlBody it is safe to use HTML entities instead: &mdash; &ndash; &#9971;
// ============================================================

// -- Cache helpers ------------------------------------------
var CACHE_KEY = 'sgf_events_json';
var CACHE_TTL = 120; // seconds - tweak as needed

function getCachedEventsJson() {
  try {
    var cache = CacheService.getScriptCache();
    var hit = cache.get(CACHE_KEY);
    if (hit) return hit;
  } catch(e) {}
  var json = JSON.stringify(getAllEventsData());
  try { CacheService.getScriptCache().put(CACHE_KEY, json, CACHE_TTL); } catch(e) {}
  return json;
}

function invalidateEventsCache() {
  try { CacheService.getScriptCache().remove(CACHE_KEY); } catch(e) {}
}


// -- Entry point ---------------------------------------------
function doGet(e) {
  if (e && e.parameter && e.parameter.cancel) {
    return serveCancellation(e.parameter.cancel);
  }

  var template = HtmlService.createTemplateFromFile('index');
  template.webAppUrl = WEB_APP_URL;
  try {
    template.initialData = getCachedEventsJson()
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  } catch(err) {
    template.initialData = '[]';
    Logger.log('doGet error: ' + err.message);
  }
  return template.evaluate()
    .setTitle('SGF Saturday Golf Friends - Sign Up')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// -- Cancellation page ---------------------------------------
function serveCancellation(token) {
  var result;
  try {
    result = cancelSignup(token);
  } catch(err) {
    Logger.log('serveCancellation error: ' + err.message);
    result = { success: false, message: 'Something went wrong on our end. Please email ' + SGF_REPLY_TO + ' and we will take care of it.' };
  }
  var appUrl = WEB_APP_URL;

  var body = result.success
    ? '<div class="icon">&#x26F3;</div>'
      + '<h1>You\'re off the list</h1>'
      + '<p>' + escHtml(result.message) + '</p>'
      + '<a class="btn" href="' + escHtml(appUrl) + '">View Open Spots</a>'
    : '<div class="icon">&#x2753;</div>'
      + '<h1>Link not found</h1>'
      + '<p>' + escHtml(result.message) + '</p>'
      + '<a class="btn" href="' + escHtml(appUrl) + '">Back to Signup</a>';

  var html = '<!DOCTYPE html><html><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>SGF Signup</title>'
    + '<style>'
    + 'body{font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;background:#f1f8e9;'
    + 'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}'
    + '.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.13);'
    + 'padding:40px 28px;max-width:420px;width:100%;text-align:center;}'
    + '.icon{font-size:2.8rem;margin-bottom:14px;}'
    + 'h1{font-size:1.3rem;color:#222;margin-bottom:10px;font-weight:700;}'
    + 'p{color:#555;font-size:.9rem;line-height:1.6;margin-bottom:0;}'
    + '.btn{display:inline-block;margin-top:22px;background:#2e7d32;color:#fff;text-decoration:none;'
    + 'border-radius:24px;padding:10px 26px;font-size:.9rem;font-weight:700;}'
    + '</style></head><body><div class="card">' + body + '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('SGF Signup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


// ============================================================
// SHARED EMAIL BUILDERS
// ============================================================

// Outer shell: coloured header, white body, footer. Used by every SGF email.
function sgfShell(accent, accentSoft, heading, subheading, bodyHtml) {
  return '<div style="margin:0;padding:24px 10px;background:#eceee9;">'
    + '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;'
    + 'background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dfe3de;">'
    +   '<div style="background:' + accent + ';padding:26px 24px;text-align:center;">'
    +     '<div style="font-size:30px;line-height:1;margin-bottom:8px;">&#9971;</div>'
    +     '<h1 style="color:#ffffff;margin:0;font-size:21px;font-weight:bold;">' + heading + '</h1>'
    +     '<p style="color:' + accentSoft + ';margin:7px 0 0;font-size:13px;letter-spacing:.4px;">' + subheading + '</p>'
    +   '</div>'
    +   '<div style="padding:26px 24px;color:#333333;">' + bodyHtml + '</div>'
    +   '<div style="background:#f5f7f4;padding:16px 24px;text-align:center;border-top:1px solid #e3e7e3;">'
    +     '<p style="margin:0 0 5px;font-size:13px;color:#5a5a5a;font-weight:bold;">Saturday Golf Friends</p>'
    +     '<p style="margin:0;font-size:12px;color:#999999;">'
    +       '<a href="' + SGF_SITE_URL + '" style="color:#2e7d32;text-decoration:none;">saturdaygolffriends.com</a>'
    +       ' &nbsp;&middot;&nbsp; '
    +       '<a href="mailto:' + SGF_REPLY_TO + '" style="color:#2e7d32;text-decoration:none;">' + SGF_REPLY_TO + '</a>'
    +     '</p>'
    +   '</div>'
    + '</div></div>';
}

// One label/value line inside the details card
function sgfRow(label, value) {
  return '<tr>'
    + '<td style="padding:6px 12px 6px 0;font-size:11px;color:#7d7d7d;font-weight:bold;'
    + 'text-transform:uppercase;letter-spacing:.7px;white-space:nowrap;vertical-align:top;">' + label + '</td>'
    + '<td style="padding:6px 0;font-size:15px;color:#222222;font-weight:bold;">' + value + '</td>'
    + '</tr>';
}

function sgfCard(rowsHtml, accent) {
  return '<div style="background:#f7faf7;border-left:4px solid ' + accent + ';'
    + 'border-radius:0 6px 6px 0;padding:12px 16px;margin:18px 0;">'
    + '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
    + rowsHtml + '</table></div>';
}

function sgfButton(href, label, color) {
  return '<a href="' + href + '" style="background:' + color + ';color:#ffffff;padding:12px 26px;'
    + 'border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;display:inline-block;">'
    + label + '</a>';
}

// Assemble "Sep 26, 2026 - Ojai Valley Inn at 11:00 AM" for subject lines. ASCII only.
function sgfEventLine(eventDate, course, teeTime) {
  return (eventDate || 'TBD')
    + (course  ? ' - '  + course  : '')
    + (teeTime ? ' at ' + teeTime : '');
}


// -- Get or create the hidden tokens sheet -------------------
function getOrCreateTokensSheet(ss) {
  var ts = ss.getSheetByName(TOKENS_SHEET);
  if (!ts) {
    ts = ss.insertSheet(TOKENS_SHEET);
    ts.hideSheet();
    ts.getRange(1, 1, 1, 6).setValues([['Token', 'PlayerName', 'EventDate', 'Course', 'TeeTime', 'Email']]);
    ts.setFrozenRows(1);
    return ts;
  }
  // Upgrade older 5-column token sheets in place so cancellations can email the player
  try {
    if (String(ts.getRange(1, 6).getValue() || '').trim() === '') {
      ts.getRange(1, 6).setValue('Email');
    }
  } catch(e) {
    Logger.log('Token sheet upgrade skipped: ' + e.message);
  }
  return ts;
}

// -- Cancel a signup by token --------------------------------
function cancelSignup(token) {
  token = String(token || '').trim();
  if (token.length < 10) {
    return { success: false, message: 'Invalid cancellation link.' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  invalidateEventsCache(); // clear stale cache on write
  const ts = getOrCreateTokensSheet(ss);
  const tokenRows = ts.getDataRange().getValues();
  const tz = Session.getScriptTimeZone(); // needed here for Date-aware eventDate reading

  // Find the token in the tokens sheet (row 0 is the header)
  var tokenRowNum   = -1;
  var playerName    = '';
  var eventDate     = '';
  var eventDateNice = '';
  var course        = '';
  var teeTime       = '';
  var playerEmail   = '';

  for (var i = 1; i < tokenRows.length; i++) {
    if (String(tokenRows[i][0] || '').trim() === token) {
      tokenRowNum = i + 1; // 1-based sheet row
      playerName  = String(tokenRows[i][1] || '').trim();
      // Sheets auto-converts ISO date strings to Date objects - handle both cases
      var rawEventDate = tokenRows[i][2];
      if (rawEventDate instanceof Date) {
        eventDate     = Utilities.formatDate(rawEventDate, tz, 'yyyy-MM-dd');
        eventDateNice = Utilities.formatDate(rawEventDate, tz, 'MMMM d, yyyy');
      } else {
        eventDate     = String(rawEventDate || '').trim();
        eventDateNice = eventDate;
      }
      course      = String(tokenRows[i][3] || '').trim();
      // Sheets stores "8:10 AM" as a Date on the 1899 epoch - format it back to a time
      var rawTeeTime = tokenRows[i][4];
      teeTime = (rawTeeTime instanceof Date)
        ? Utilities.formatDate(rawTeeTime, tz, 'h:mm a')
        : String(rawTeeTime || '').trim();
      playerEmail = String(tokenRows[i][5] || '').trim();
      break;
    }
  }

  if (tokenRowNum === -1) {
    return { success: false, message: 'Cancellation link not found - it may have already been used or expired.' };
  }

  // Delete the token immediately so the link can't be reused
  ts.deleteRow(tokenRowNum);

  if (!playerName) {
    return { success: false, message: 'This spot has already been cancelled.' };
  }

  // Find the player in the main tracker by name within their event
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data  = sheet.getDataRange().getValues();

  var inTargetEvent = false;
  var clearedRow    = -1;

  for (var j = 0; j < data.length; j++) {
    const rawA   = data[j][COL_TEE_TIME];
    const colB   = String(data[j][COL_PLAYER] || '').trim();

    // Detect event header rows
    var isoDate = '';
    if (rawA instanceof Date && rawA.getFullYear() > 1900) {
      isoDate = Utilities.formatDate(rawA, tz, 'yyyy-MM-dd');
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(rawA || ''))) {
      var p = String(rawA).split('/');
      isoDate = p[2] + '-' + p[0].padStart(2,'0') + '-' + p[1].padStart(2,'0');
    }

    if (isoDate && colB.length > 2
        && !colB.toUpperCase().includes('OPEN')
        && !colB.toUpperCase().includes('BOOK')) {
      if (inTargetEvent) break; // moved past the target event
      inTargetEvent = (isoDate === eventDate);
      continue;
    }

    if (!inTargetEvent) continue;

    // Match player name (case-insensitive)
    if (colB.toLowerCase() === playerName.toLowerCase()) {
      clearedRow = j + 1; // 1-based
      sheet.getRange(clearedRow, COL_PLAYER + 1).setValue('OPEN').setBackground(null);  // also clear the online-signup highlight
      Logger.log('SGF Cancel | name: %s | row: %d | at: %s',
        playerName, clearedRow, new Date().toISOString());
      // Notify first waitlisted player
      try { notifyFirstWaitlister(sheet, j, data); } catch(e2) {
        Logger.log('Waitlist notify error: ' + e2.message);
      }
      break;
    }
  }

  // -- Cancellation emails ---------------------------------
  var eventLine = sgfEventLine(eventDateNice, course, teeTime);

  // Confirmation to the player (only possible if we captured their email at signup)
  if (playerEmail) {
    try {
      MailApp.sendEmail({
        to:       playerEmail,
        name:     'SGF Saturday Golf Friends',
        replyTo:  SGF_REPLY_TO,
        subject:  'Your spot is cancelled: ' + eventLine,
        body:     buildCancelText(playerName, eventDateNice, course, teeTime),
        htmlBody: buildCancelHtml(playerName, eventDateNice, course, teeTime)
      });
    } catch(e) {
      Logger.log('Cancellation email error: ' + e.message);
    }
  }

  // Heads-up to the organizer
  try {
    MailApp.sendEmail({
      to:       SGF_ADMIN,
      name:     'SGF Saturday Golf Friends',
      subject:  'SGF Cancellation: ' + playerName + ' - ' + eventLine,
      body:     playerName + ' cancelled their spot.\n\n'
              + 'Player:  ' + playerName + '\n'
              + 'Email:   ' + (playerEmail || '(not provided)') + '\n'
              + 'Date:    ' + (eventDateNice || 'TBD') + '\n'
              + 'Course:  ' + (course  || 'TBD') + '\n'
              + 'Tee Time:' + (teeTime || 'TBD') + '\n\n'
              + (clearedRow > -1
                  ? 'The tracker row was set back to OPEN.\n'
                  : 'NOTE: the player row was not found in the tracker - please check it by hand.\n')
              + '\n- SGF Golf Signup',
      htmlBody: buildAdminCancelHtml(playerName, playerEmail, eventDateNice, course, teeTime, clearedRow > -1)
    });
  } catch(e) {
    Logger.log('Admin cancellation email error: ' + e.message);
  }

  if (clearedRow > -1) {
    return { success: true, message: playerName + '\'s spot has been cancelled and is now open to other players.' };
  } else {
    // Token was valid but player row not found - still report success to the user
    Logger.log('SGF Cancel | token valid but player not found in tracker | name: %s | event: %s', playerName, eventDate);
    return { success: true, message: playerName + '\'s cancellation was received. (Spot may have already been updated.)' };
  }
}

// -- Read ALL upcoming events from the sheet -----------------
function getAllEventsData() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data  = sheet.getDataRange().getValues();
  const tz    = Session.getScriptTimeZone();

  const events = [];
  let currentEvent     = null;
  let inPlayerSection  = false;
  let currentTeeTime   = '';
  let consecutiveEmpty = 0;

  for (let i = 0; i < data.length; i++) {
    const row   = data[i];
    const cells = row.map(c => {
      if (c === null || c === undefined) return '';
      if (c instanceof Date) {
        if (c.getFullYear() <= 1900) return Utilities.formatDate(c, tz, 'h:mm a');
        return Utilities.formatDate(c, tz, 'M/d/yyyy');
      }
      return String(c).trim();
    });

    const rawA = row[COL_TEE_TIME];
    let dateStr = '', isoDate = '', formattedDate = '';

    if (rawA instanceof Date && rawA.getFullYear() > 1900) {
      dateStr       = cells[COL_TEE_TIME];
      isoDate       = Utilities.formatDate(rawA, tz, 'yyyy-MM-dd');
      formattedDate = Utilities.formatDate(rawA, tz, 'MMMM d, yyyy');
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cells[COL_TEE_TIME])) {
      dateStr = cells[COL_TEE_TIME];
      const p = dateStr.split('/');
      isoDate       = p[2] + '-' + p[0].padStart(2,'0') + '-' + p[1].padStart(2,'0');
      const d       = new Date(parseInt(p[2]), parseInt(p[0])-1, parseInt(p[1]));
      formattedDate = Utilities.formatDate(d, tz, 'MMMM d, yyyy');
    }

    const courseVal = cells[COL_PLAYER];
    const isEventHeader = dateStr !== ''
      && courseVal.length > 2
      && !courseVal.toUpperCase().includes('BOOK')
      && !courseVal.toUpperCase().includes('OPEN');

    if (isEventHeader) {
      currentEvent = {
        isoDate:       isoDate,
        formattedDate: formattedDate,
        course:        courseVal,
        tbd:           courseVal.toUpperCase().includes('TBD'),
        golfMoose:     courseVal.toUpperCase().includes('GOLF MOOSE'),
        deadline:      '',
        games:         '',
        payRequired:   '',   // filled from first player row that has Col H data
        serviceFee:    10,   // default; overridden when TEE TIME/PLAYERS header row is found
        waitlist:      [],
        playerRows:    []
      };
      events.push(currentEvent);
      inPlayerSection  = false;
      currentTeeTime   = '';
      consecutiveEmpty = 0;

      for (let c = 2; c < cells.length; c++) {
        const up = cells[c].toUpperCase();
        if (up.includes('DEADLINE') || up.includes('BOOK BY') || up.startsWith('BOOK ')) {
          currentEvent.deadline = cells[c]; break;
        }
      }
      continue;
    }

    if (!currentEvent) continue;

    if (!inPlayerSection) {
      if (!currentEvent.deadline) {
        for (const cell of cells) {
          const up = cell.toUpperCase();
          if (up.includes('DEADLINE') || up.includes('BOOK BY') || up.startsWith('BOOK ')) {
            currentEvent.deadline = cell; break;
          }
        }
      }
      if (!currentEvent.games) {
        for (const cell of cells) {
          if (cell.toUpperCase().startsWith('GAMES:')) { currentEvent.games = cell; break; }
        }
      }
      const rowText = cells.join(' ').toUpperCase();
      if ((rowText.includes('TEE TIME') || rowText.includes('T TIME')) && rowText.includes('PLAYERS')) {
        inPlayerSection = true;
        // Parse service fee from Col D (e.g. "15.00 Service Fee" or "10.00 Service Fee")
        var sfVal = parseFloat(String(cells[3] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(sfVal) && sfVal > 0) currentEvent.serviceFee = sfVal;
      }
      continue;
    }

    const rawTee    = cells[COL_TEE_TIME];
    const playerVal = cells[COL_PLAYER];

    if (rawTee === '' && playerVal === '') {
      if (++consecutiveEmpty >= 3) {
        inPlayerSection  = false;
        currentEvent     = null;
        currentTeeTime   = '';
        consecutiveEmpty = 0;
      }
      continue;
    }
    consecutiveEmpty = 0;

    // Waitlist rows have 'WAITLIST' in the tee-time column
    if (rawTee === 'WAITLIST') {
      currentEvent.waitlist.push({
        rowIndex: i + 1,
        player:   playerVal,
        email:    cells[COL_EMAIL] || ''
      });
      continue;
    }

    const teeOnThisRow = !!(rawTee && rawTee !== '0');
    if (teeOnThisRow) currentTeeTime = rawTee;
    if (!playerVal || playerVal.length < 2) continue;

    // Capture pay required from first player row that has Col H data
    if (!currentEvent.payRequired && cells[COL_COURSE_HCP]) {
      currentEvent.payRequired = cells[COL_COURSE_HCP];
    }

    currentEvent.playerRows.push({
      rowIndex:   i + 1,
      teeTime:    currentTeeTime,
      groupStart: teeOnThisRow,
      player:     playerVal,
      isOpen:     playerVal.toUpperCase() === 'OPEN',
      tee:        cells[COL_TEE]        || '',
      index:      cells[COL_INDEX]      || '',
      courseHcp:  cells[COL_COURSE_HCP] || ''
    });
  }

  return events;
}


// ============================================================
// SIGNUP CONFIRMATION - PLAYER
// ============================================================
function buildSignupHtml(playerName, eventDate, course, teeTime, note, cancelUrl) {
  var rows = sgfRow('Date',   escHtml(eventDate || 'TBD'))
           + sgfRow('Course', escHtml(course    || 'TBD'))
           + (teeTime ? sgfRow('Tee Time', escHtml(teeTime)) : '');

  var body = '<p style="font-size:16px;margin:0 0 14px;">Hi ' + escHtml(playerName) + ',</p>'
    + '<p style="color:#555555;line-height:1.6;margin:0;">You\'re on the list. Here are your details:</p>'
    + sgfCard(rows, '#2e7d32')
    + (note
        ? '<p style="color:#555555;line-height:1.6;margin:0 0 16px;font-size:14px;">'
          + '<strong style="color:#333;">Your note:</strong> ' + escHtml(note) + '</p>'
        : '')
    + '<p style="color:#555555;line-height:1.6;margin:0 0 8px;font-size:14px;">'
    +   '<strong style="color:#333;">Before you play</strong></p>'
    + '<ul style="color:#555555;line-height:1.7;margin:0 0 20px;padding-left:20px;font-size:14px;">'
    +   '<li>Arrive <strong>30&ndash;45 minutes early</strong> &mdash; we sometimes go out ahead of schedule.</li>'
    +   '<li>Your index and course handicap are assigned the day before we play.</li>'
    +   '<li>Full player info, pairings and green fees go out the night before.</li>'
    + '</ul>'
    + '<hr style="border:none;border-top:1px solid #e8e8e8;margin:0 0 20px;">'
    + '<p style="color:#555555;line-height:1.6;margin:0 0 14px;font-size:14px;text-align:center;">'
    +   'Plans change? Please cancel early so someone on the waitlist can take your spot.</p>'
    + '<div style="text-align:center;margin:0 0 22px;">'
    +   sgfButton(cancelUrl, 'Cancel My Spot', '#c62828')
    + '</div>'
    + '<div style="text-align:center;">'
    +   sgfButton(WEB_APP_URL, '&#128197; Sign Up for Another Event', '#2e7d32')
    + '</div>'
    + '<p style="font-size:11px;color:#999999;text-align:center;line-height:1.7;margin:20px 0 0;">'
    +   'If you did not sign up for this event, you can cancel your spot above. Or you can contact '
    +   'the Administrator, <a href="mailto:' + SGF_REPLY_TO + '" style="color:#7a8a7a;">' + SGF_REPLY_TO + '</a>, '
    +   'and ask to be removed from the event.</p>';

  return sgfShell('#2e7d32', '#c8e6c9', 'You\'re Signed Up!', 'SATURDAY GOLF FRIENDS', body);
}

function buildSignupText(playerName, eventDate, course, teeTime, note, cancelUrl) {
  return 'Hi ' + playerName + ',\n\n'
    + 'You\'re on the list. Here are your details:\n\n'
    + '  Date:     ' + (eventDate || 'TBD') + '\n'
    + '  Course:   ' + (course    || 'TBD') + '\n'
    + (teeTime ? '  Tee Time: ' + teeTime + '\n' : '')
    + (note ? '\nYour note: ' + note + '\n' : '')
    + '\nBEFORE YOU PLAY\n'
    + '  * Arrive 30-45 minutes early - we sometimes go out ahead of schedule.\n'
    + '  * Your index and course handicap are assigned the day before we play.\n'
    + '  * Full player info, pairings and green fees go out the night before.\n\n'
    + 'Plans change? Please cancel early so someone on the waitlist can take your spot:\n'
    + cancelUrl + '\n\n'
    + 'Sign up for another event:\n' + WEB_APP_URL + '\n\n'
    + 'If you did not sign up for this event, you can cancel your spot above.\n'
    + 'Or you can contact the Administrator, ' + SGF_REPLY_TO + ', and ask to be\n'
    + 'removed from the event.\n\n'
    + 'See you on the course!\n'
    + 'Saturday Golf Friends\n'
    + SGF_SITE_URL;
}


// ============================================================
// SIGNUP NOTIFICATION - ORGANIZER
// ============================================================
function buildAdminSignupHtml(playerName, email, eventDate, course, teeTime, voucherCode, note, isHIO) {
  var rows = sgfRow('Player', escHtml(playerName))
           + sgfRow('Email',  email
                ? '<a href="mailto:' + escHtml(email) + '" style="color:#1565c0;text-decoration:none;">' + escHtml(email) + '</a>'
                : '<span style="color:#b71c1c;">not provided</span>')
           + sgfRow('Date',   escHtml(eventDate || 'TBD'))
           + sgfRow('Course', escHtml(course    || 'TBD'))
           + (teeTime     ? sgfRow('Tee Time', escHtml(teeTime))     : '')
           + (voucherCode ? sgfRow('Voucher',  escHtml(voucherCode)) : '')
           + sgfRow('HIO Club', isHIO
                ? '<span style="color:#1b5e20;">Yes &mdash; flagged on the tracker</span>'
                : '<span style="color:#8a8a8a;">No</span>');

  var body = '<p style="margin:0 0 4px;color:#555555;font-size:15px;">A new player just signed up.</p>'
    + sgfCard(rows, '#1565c0')
    + (note
        ? '<div style="background:#fffdf0;border:1px solid #f0e2a8;border-radius:6px;padding:12px 14px;margin:0 0 18px;">'
          + '<p style="margin:0;font-size:14px;color:#5a4b00;"><strong>Note from player:</strong><br>' + escHtml(note) + '</p>'
          + '</div>'
        : '')
    + '<div style="text-align:center;margin-top:6px;">'
    +   sgfButton(WEB_APP_URL, 'Open the Signup App', '#1565c0')
    + '</div>';

  return sgfShell('#1a4d24', '#c8e6c9', 'New Signup', 'SGF ORGANIZER ALERT', body);
}


// ============================================================
// CANCELLATION CONFIRMATION - PLAYER
// ============================================================
function buildCancelHtml(playerName, eventDate, course, teeTime) {
  var rows = sgfRow('Date',   escHtml(eventDate || 'TBD'))
           + sgfRow('Course', escHtml(course    || 'TBD'))
           + (teeTime ? sgfRow('Tee Time', escHtml(teeTime)) : '');

  var body = '<p style="font-size:16px;margin:0 0 14px;">Hi ' + escHtml(playerName) + ',</p>'
    + '<p style="color:#555555;line-height:1.6;margin:0;">Your spot has been released and is now open to other players. '
    + 'Nothing else is needed from you.</p>'
    + sgfCard(rows, '#c62828')
    + '<p style="color:#555555;line-height:1.6;margin:0 0 20px;font-size:14px;">'
    +   'Sorry to miss you this time &mdash; hope to see you at the next one.</p>'
    + '<div style="text-align:center;">'
    +   sgfButton(WEB_APP_URL, '&#128197; Browse Upcoming Events', '#2e7d32')
    + '</div>';

  return sgfShell('#c62828', '#ffcdd2', 'Your Spot Is Cancelled', 'SATURDAY GOLF FRIENDS', body);
}

function buildCancelText(playerName, eventDate, course, teeTime) {
  return 'Hi ' + playerName + ',\n\n'
    + 'Your spot has been released and is now open to other players. Nothing else is needed from you.\n\n'
    + '  Date:     ' + (eventDate || 'TBD') + '\n'
    + '  Course:   ' + (course    || 'TBD') + '\n'
    + (teeTime ? '  Tee Time: ' + teeTime + '\n' : '')
    + '\nSorry to miss you this time - hope to see you at the next one.\n\n'
    + 'Browse upcoming events:\n' + WEB_APP_URL + '\n\n'
    + 'Saturday Golf Friends\n'
    + SGF_SITE_URL;
}

function buildAdminCancelHtml(playerName, email, eventDate, course, teeTime, rowCleared) {
  var rows = sgfRow('Player', escHtml(playerName))
           + sgfRow('Email',  email ? escHtml(email) : '<span style="color:#8a8a8a;">not provided</span>')
           + sgfRow('Date',   escHtml(eventDate || 'TBD'))
           + sgfRow('Course', escHtml(course    || 'TBD'))
           + (teeTime ? sgfRow('Tee Time', escHtml(teeTime)) : '')
           + sgfRow('Tracker', rowCleared
                ? '<span style="color:#1b5e20;">Row set back to OPEN</span>'
                : '<span style="color:#b71c1c;">Row NOT found &mdash; check by hand</span>');

  var body = '<p style="margin:0 0 4px;color:#555555;font-size:15px;">A player cancelled their spot.</p>'
    + sgfCard(rows, '#c62828')
    + '<div style="text-align:center;margin-top:6px;">'
    +   sgfButton(WEB_APP_URL, 'Open the Signup App', '#1565c0')
    + '</div>';

  return sgfShell('#1a4d24', '#ffcdd2', 'Cancellation', 'SGF ORGANIZER ALERT', body);
}


// -- Write a signup to the sheet -----------------------------
function signupPlayer(rowIndex, playerName, email, course, teeTime, eventDate, voucherCode, noteToOrganizer, signupCode) {
  invalidateEventsCache(); // clear stale cache on write
  playerName = String(playerName || '').trim();
  email      = String(email      || '').trim().toLowerCase();
  course     = String(course     || '').trim();
  teeTime    = String(teeTime    || '').trim();
  eventDate  = String(eventDate  || '').trim();

  if (!playerName || playerName.length < 2) {
    return { success: false, message: 'Please enter your name (at least 2 characters).' };
  }
  var nameParts = playerName.split(/\s+/).filter(function(p) { return p.length > 0; });
  if (nameParts.length < 2 || nameParts[0].length < 2 || nameParts[nameParts.length - 1].length < 2) {
    return { success: false, message: 'Please enter BOTH your first and last name - for example: John Smith.' };
  }
  playerName = nameParts.join(' ');  // collapse any extra spaces
  if (playerName.length > 60) {
    return { success: false, message: 'Name is too long - please use 60 characters or fewer.' };
  }
  if (playerName.toUpperCase() === 'OPEN') {
    return { success: false, message: 'Please enter your real name.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'Please enter a valid email address.' };
  }

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  const playerCell   = sheet.getRange(rowIndex, COL_PLAYER + 1);
  const currentValue = String(playerCell.getValue()).trim().toUpperCase();

  if (currentValue !== 'OPEN') {
    return {
      success: false,
      message: currentValue === ''
        ? 'This slot is no longer available.'
        : 'Sorry - this spot was just taken. Please choose another.'
    };
  }

  // Generate cancellation token - stored in the hidden SGF_CancelTokens sheet, not in the tracker
  var token = email ? Utilities.getUuid() : '';

  // Write player name to the main tracker only
  playerCell.setValue(playerName);
  // Pale green = the golfer signed himself up. Pale blue = the organizer entered him after a
  // text or email. Told apart by which passcode was used on the form; an absent or unknown
  // code falls back to green so nothing can break the normal path.
  var byOrganizer = String(signupCode || '').trim().toUpperCase() === ORGANIZER_CODE;
  playerCell.setBackground(byOrganizer ? ORGANIZER_SIGNUP_COLOR : ONLINE_SIGNUP_COLOR);

  // Mark HIO club members automatically
  var hio = isHIOmember(ss, playerName);
  if (hio) {
    sheet.getRange(rowIndex, COL_HIO + 1).setValue('YES');
  }

  // Write token to the separate tokens sheet so the main tracker rows can be freely reorganized
  if (email) {
    var ts = getOrCreateTokensSheet(ss);
    ts.appendRow([token, playerName, eventDate, course, teeTime, email]);
  }

  Logger.log('SGF Signup | name: %s | email: %s | row: %d | at: %s',
    playerName, email || 'n/a', rowIndex, new Date().toISOString());

  var eventLine = sgfEventLine(eventDate, course, teeTime);

  // Admin notification to organizer
  try {
    MailApp.sendEmail({
      to:       SGF_ADMIN,
      name:     'SGF Saturday Golf Friends',
      replyTo:  email || SGF_REPLY_TO,
      subject:  'SGF Signup: ' + playerName + ' - ' + eventLine,
      body:     'A new player just signed up for Saturday Golf Friends.\n\n'
              + 'Name:     ' + playerName + '\n'
              + 'Email:    ' + (email || '(not provided)') + '\n'
              + 'Date:     ' + (eventDate || 'TBD') + '\n'
              + 'Course:   ' + (course    || 'TBD') + '\n'
              + (teeTime     ? 'Tee Time: ' + teeTime     + '\n' : '')
              + (voucherCode ? 'Voucher:  ' + voucherCode + '\n' : '')
              + 'HIO Club: ' + (hio ? 'Yes' : 'No') + '\n'
              + (noteToOrganizer ? '\nNote from player:\n' + noteToOrganizer + '\n' : '')
              + '\n- SGF Golf Signup',
      htmlBody: buildAdminSignupHtml(playerName, email, eventDate, course, teeTime, voucherCode, noteToOrganizer, hio)
    });
  } catch(e) {
    Logger.log('Admin notification error: ' + e.message);
  }

  // Confirmation email to the player (includes cancel link)
  if (email) {
    try {
      var cancelUrl = WEB_APP_URL + '?cancel=' + encodeURIComponent(token);
      MailApp.sendEmail({
        to:       email,
        name:     'SGF Saturday Golf Friends',
        replyTo:  SGF_REPLY_TO,
        subject:  'You\'re signed up: ' + eventLine,
        body:     buildSignupText(playerName, eventDate, course, teeTime, noteToOrganizer, cancelUrl),
        htmlBody: buildSignupHtml(playerName, eventDate, course, teeTime, noteToOrganizer, cancelUrl)
      });
    } catch(e) {
      Logger.log('Signup email error: ' + e.message);
    }
  }

  return { success: true, message: playerName + ' is all set! See you on the course.', appUrl: WEB_APP_URL };
}

// -- HIO Club lookup -----------------------------------------
// Returns true if playerName (as "First Last") matches any member in the HIO sheet
function isHIOmember(ss, playerName) {
  try {
    var hioSheet = ss.getSheetByName(HIO_SHEET_NAME);
    if (!hioSheet) return false;
    var data = hioSheet.getDataRange().getValues();
    var nameLower = playerName.trim().toLowerCase();
    for (var i = 2; i < data.length; i++) {   // row 3+ (skip 2 header rows)
      var last  = String(data[i][1] || '').trim().toLowerCase();  // col B: Last Name
      var first = String(data[i][2] || '').trim().toLowerCase();  // col C: First Name
      if (!last) continue;
      // Match "First Last" OR "Last First" (handles both entry styles)
      if (nameLower === first + ' ' + last || nameLower === last + ' ' + first) return true;
    }
  } catch(e) {
    Logger.log('HIO lookup error: ' + e.message);
  }
  return false;
}


// ============================================================
// WAITLIST - SPOT OPENED
// ============================================================
function buildWaitlistHtml(playerName, eventDateNice) {
  var body = '<p style="font-size:16px;margin:0 0 14px;">Hi ' + escHtml(playerName) + ',</p>'
    + '<p style="color:#555555;line-height:1.6;margin:0 0 6px;">Good news &mdash; a spot just opened up for the '
    + 'Saturday Golf Friends round on <strong>' + escHtml(eventDateNice) + '</strong>.</p>'
    + '<p style="color:#555555;line-height:1.6;margin:0 0 20px;">Spots go fast, so grab it while it\'s there.</p>'
    + '<div style="text-align:center;">' + sgfButton(WEB_APP_URL, 'Claim the Spot', '#1565c0') + '</div>';
  return sgfShell('#1565c0', '#bbdefb', 'A Spot Just Opened Up!', 'SATURDAY GOLF FRIENDS', body);
}

function buildWaitlistText(playerName, eventDateNice) {
  return 'Hi ' + playerName + ',\n\n'
    + 'Good news - a spot just opened up for the Saturday Golf Friends round on '
    + eventDateNice + '.\n\nSpots go fast, so grab it while it\'s there:\n'
    + WEB_APP_URL + '\n\nSee you on the course!\nSaturday Golf Friends\n' + SGF_SITE_URL;
}

// -- Notify first waitlisted player after a cancellation -----
function notifyFirstWaitlister(sheet, canceledRowIdx, data) {
  const tz = Session.getScriptTimeZone();

  // Scan up from the canceled row to find this event's isoDate
  var eventIsoDate = '';
  var eventNice    = '';
  for (var i = canceledRowIdx - 1; i >= 0; i--) {
    const rawA = data[i][COL_TEE_TIME];
    const courseVal = String(data[i][COL_PLAYER] || '').trim();
    var isoDate = '';
    if (rawA instanceof Date && rawA.getFullYear() > 1900) {
      isoDate = Utilities.formatDate(rawA, tz, 'yyyy-MM-dd');
    }
    if (isoDate && courseVal.length > 2
        && !courseVal.toUpperCase().includes('OPEN')
        && !courseVal.toUpperCase().includes('BOOK')) {
      eventIsoDate = isoDate;
      eventNice    = Utilities.formatDate(rawA, tz, 'MMMM d, yyyy') + ' - ' + courseVal;
      break;
    }
  }
  if (!eventIsoDate) return;

  // Scan down for the first WAITLIST row for this event
  for (var j = canceledRowIdx + 1; j < data.length; j++) {
    const rawA     = String(data[j][COL_TEE_TIME] || '').trim();
    const playerVal = String(data[j][COL_PLAYER]  || '').trim();
    const email     = String(data[j][COL_EMAIL]   || '').trim();

    // Stop if we hit a new event header (date row)
    const nextRaw = data[j][COL_TEE_TIME];
    if (nextRaw instanceof Date && nextRaw.getFullYear() > 1900 && playerVal.length > 2) break;

    if (rawA === 'WAITLIST' && playerVal && email) {
      MailApp.sendEmail({
        to:       email,
        name:     'SGF Saturday Golf Friends',
        replyTo:  SGF_REPLY_TO,
        subject:  'A spot just opened up: ' + eventNice,
        body:     buildWaitlistText(playerVal, eventNice),
        htmlBody: buildWaitlistHtml(playerVal, eventNice)
      });
      Logger.log('SGF Waitlist Notify | name: %s | email: %s | event: %s | row: %d',
        playerVal, email, eventIsoDate, j + 1);

      // Clear their waitlist row
      sheet.getRange(j + 1, COL_TEE_TIME + 1).setValue('');
      sheet.getRange(j + 1, COL_PLAYER   + 1).setValue('');
      sheet.getRange(j + 1, COL_EMAIL    + 1).setValue('');
      break;
    }
  }
}

// -- Add a player to the waitlist ----------------------------
function addToWaitlist(eventIsoDate, playerName, email) {
  invalidateEventsCache(); // clear stale cache on write
  playerName = String(playerName || '').trim();
  email      = String(email      || '').trim().toLowerCase();

  if (!playerName || playerName.length < 2) {
    return { success: false, message: 'Please enter your full name (at least 2 characters).' };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'A valid email address is required so we can notify you if a spot opens up.' };
  }

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data  = sheet.getDataRange().getValues();
  const tz    = Session.getScriptTimeZone();

  // Find the target event and the last row of its player section
  var inTarget         = false;
  var inPlayerSection  = false;
  var lastEventRow     = -1;
  var consecutiveEmpty = 0;

  for (var i = 0; i < data.length; i++) {
    const row   = data[i];
    const cells = row.map(function(c) {
      if (c === null || c === undefined) return '';
      if (c instanceof Date) {
        if (c.getFullYear() <= 1900) return Utilities.formatDate(c, tz, 'h:mm a');
        return Utilities.formatDate(c, tz, 'yyyy-MM-dd');
      }
      return String(c).trim();
    });

    const rawA = row[COL_TEE_TIME];
    var isoDate = '';
    if (rawA instanceof Date && rawA.getFullYear() > 1900) {
      isoDate = Utilities.formatDate(rawA, tz, 'yyyy-MM-dd');
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cells[COL_TEE_TIME])) {
      const p = cells[COL_TEE_TIME].split('/');
      isoDate = p[2] + '-' + p[0].padStart(2,'0') + '-' + p[1].padStart(2,'0');
    }

    const courseVal     = cells[COL_PLAYER];
    const isEventHeader = isoDate !== ''
      && courseVal.length > 2
      && !courseVal.toUpperCase().includes('BOOK')
      && !courseVal.toUpperCase().includes('OPEN');

    if (isEventHeader) {
      if (inTarget) break; // passed our event
      if (isoDate === eventIsoDate) {
        inTarget        = true;
        inPlayerSection = false;
        consecutiveEmpty = 0;
        lastEventRow    = i + 1;
      }
      continue;
    }

    if (!inTarget) continue;

    const rawTee    = cells[COL_TEE_TIME];
    const playerVal = cells[COL_PLAYER];

    if (!inPlayerSection) {
      const rowText = cells.join(' ').toUpperCase();
      if ((rowText.includes('TEE TIME') || rowText.includes('T TIME')) && rowText.includes('PLAYERS')) {
        inPlayerSection = true;
      }
      continue;
    }

    if (rawTee === '' && playerVal === '') {
      if (++consecutiveEmpty >= 3) break;
      continue;
    }
    consecutiveEmpty = 0;
    lastEventRow = i + 1;
  }

  if (lastEventRow === -1) {
    return { success: false, message: 'Event not found. Please refresh and try again.' };
  }

  // Insert a new row after the last row of this event's section
  sheet.insertRowAfter(lastEventRow);
  const newRow = lastEventRow + 1;
  sheet.getRange(newRow, COL_TEE_TIME + 1).setValue('WAITLIST');
  sheet.getRange(newRow, COL_PLAYER   + 1).setValue(playerName);
  sheet.getRange(newRow, COL_EMAIL    + 1).setValue(email);

  Logger.log('SGF Waitlist Add | name: %s | email: %s | event: %s | row: %d',
    playerName, email, eventIsoDate, newRow);

  // Admin notification
  try {
    MailApp.sendEmail({
      to:      SGF_ADMIN,
      name:    'SGF Saturday Golf Friends',
      replyTo: email,
      subject: 'SGF Waitlist: ' + playerName + ' joined the waitlist',
      body:    playerName + ' (' + email + ') joined the waitlist for the event on '
             + eventIsoDate + '.\n\n- SGF Golf Signup'
    });
  } catch(e) { Logger.log('Waitlist admin email error: ' + e.message); }

  // Confirmation to player
  try {
    var wlBody = '<p style="font-size:16px;margin:0 0 14px;">Hi ' + escHtml(playerName) + ',</p>'
      + '<p style="color:#555555;line-height:1.6;margin:0 0 6px;">You\'re on the waitlist for the Saturday Golf Friends '
      + 'round on <strong>' + escHtml(eventIsoDate) + '</strong>.</p>'
      + '<p style="color:#555555;line-height:1.6;margin:0 0 20px;">If a spot opens up we\'ll email you right away so you can grab it. '
      + 'No need to check back.</p>'
      + '<div style="text-align:center;">' + sgfButton(WEB_APP_URL, 'View All Events', '#2e7d32') + '</div>';
    MailApp.sendEmail({
      to:       email,
      name:     'SGF Saturday Golf Friends',
      replyTo:  SGF_REPLY_TO,
      subject:  'You\'re on the waitlist: ' + eventIsoDate,
      body:     'Hi ' + playerName + ',\n\n'
              + 'You\'re on the waitlist for the Saturday Golf Friends round on ' + eventIsoDate + '.\n\n'
              + 'If a spot opens up we\'ll email you right away so you can grab it. No need to check back.\n\n'
              + 'View all events:\n' + WEB_APP_URL + '\n\n'
              + 'Saturday Golf Friends\n' + SGF_SITE_URL,
      htmlBody: sgfShell('#f9a825', '#fff8e1', 'You\'re on the Waitlist', 'SATURDAY GOLF FRIENDS', wlBody)
    });
  } catch(e) { Logger.log('Waitlist player email error: ' + e.message); }

  return { success: true, message: "You're on the waitlist! We'll email you if a spot opens up." };
}

// -- Sheet menu (runs when the spreadsheet is opened) ------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SGF Tools')
    .addItem('Notify waitlist for selected row\'s event', 'manualNotifyWaitlist')
    .addToUi();
}

// -- Manual waitlist notification (called from sheet menu) -------------------
function manualNotifyWaitlist() {
  var ui    = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();

  // Find which event the selected row belongs to
  var rowIdx = sheet.getActiveCell().getRow() - 1; // convert to 0-based
  var eventIsoDate = '';
  var eventDesc    = '';
  var eventNice    = '';

  for (var i = rowIdx; i >= 0; i--) {
    var rawA      = data[i][COL_TEE_TIME];
    var courseVal = String(data[i][COL_PLAYER] || '').trim();
    var isoDate   = '';
    if (rawA instanceof Date && rawA.getFullYear() > 1900) {
      isoDate = Utilities.formatDate(rawA, tz, 'yyyy-MM-dd');
    }
    if (isoDate && courseVal.length > 2
        && !courseVal.toUpperCase().includes('OPEN')
        && !courseVal.toUpperCase().includes('BOOK')) {
      eventIsoDate = isoDate;
      eventDesc    = courseVal;
      eventNice    = Utilities.formatDate(rawA, tz, 'MMMM d, yyyy') + ' - ' + courseVal;
      break;
    }
  }

  if (!eventIsoDate) {
    ui.alert('No event found for the selected row. Click a row inside an event section and try again.');
    return;
  }

  var confirm = ui.alert(
    'Notify Waitlist',
    'Send the open-spot email to the first waitlisted player for:\n\n' + eventDesc + '  --  ' + eventIsoDate + '?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // Scan for the first WAITLIST row belonging to this event
  var freshData = sheet.getDataRange().getValues();
  var inEvent   = false;

  for (var j = 0; j < freshData.length; j++) {
    var rA    = freshData[j][COL_TEE_TIME];
    var cVal  = String(freshData[j][COL_PLAYER] || '').trim();
    var iso   = '';
    if (rA instanceof Date && rA.getFullYear() > 1900) {
      iso = Utilities.formatDate(rA, tz, 'yyyy-MM-dd');
    }

    // Event header row
    if (iso && cVal.length > 2
        && !cVal.toUpperCase().includes('OPEN')
        && !cVal.toUpperCase().includes('BOOK')) {
      if (inEvent) break; // moved past our event
      if (iso === eventIsoDate) inEvent = true;
      continue;
    }

    if (!inEvent) continue;

    var teeVal    = String(freshData[j][COL_TEE_TIME] || '').trim();
    var playerVal = String(freshData[j][COL_PLAYER]   || '').trim();
    var email     = String(freshData[j][COL_EMAIL]    || '').trim();

    if (teeVal === 'WAITLIST' && playerVal && email) {
      MailApp.sendEmail({
        to:       email,
        name:     'SGF Saturday Golf Friends',
        replyTo:  SGF_REPLY_TO,
        subject:  'A spot just opened up: ' + eventNice,
        body:     buildWaitlistText(playerVal, eventNice),
        htmlBody: buildWaitlistHtml(playerVal, eventNice)
      });

      // Clear the waitlist row
      sheet.getRange(j + 1, COL_TEE_TIME + 1).setValue('');
      sheet.getRange(j + 1, COL_PLAYER   + 1).setValue('');
      sheet.getRange(j + 1, COL_EMAIL    + 1).setValue('');

      Logger.log('Manual waitlist notify | name: %s | email: %s | event: %s', playerVal, email, eventIsoDate);
      ui.alert('Done! Notified ' + playerVal + ' (' + email + ') that a spot is open.');
      return;
    }
  }

  ui.alert('No waitlisted players found for this event.');
}

// -- Access Request ----------------------------------------------------------
function requestAccess(name, email, howHeard) {
  try {
    MailApp.sendEmail({
      to:      SGF_REPLY_TO,
      name:    'SGF Saturday Golf Friends',
      replyTo: email,
      subject: 'SGF Access Request from ' + name,
      body:    'Someone is requesting access to the Saturday Golf Friends signup app.\n\n'
             + 'Name:  ' + name  + '\n'
             + 'Email: ' + email + '\n'
             + 'How they heard about SGF: ' + howHeard + '\n\n'
             + 'If they are a good fit, reply to their email (' + email + ') with the group passcode.\n\n'
             + '- SGF Signup App'
    });
  } catch(e) {
    Logger.log('Access request email error: ' + e.message);
    return { success: false };
  }
  return { success: true };
}


// ============================================================
// DIAGNOSTICS - safe to remove after testing
// ============================================================
function ping() {
  return { ok: true, time: new Date().toISOString() };
}

function diagSignup() {
  var log = [];
  try {
    log.push('1:open');
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    log.push('2:sheet');
    var sheet = ss.getSheetByName(SHEET_NAME);
    log.push('sheet=' + (sheet ? sheet.getName() : 'NULL'));
    if (!sheet) return log.join('|');
    log.push('3:range');
    var cell = sheet.getRange(5, COL_PLAYER + 1);
    log.push('4:value=' + cell.getValue());
    log.push('5:tokens');
    var ts = getOrCreateTokensSheet(ss);
    log.push('tokens=' + ts.getName());
    log.push('6:hio=' + isHIOmember(ss, 'Test'));
    log.push('ALL_OK');
  } catch(e) {
    log.push('ERR:' + e.message);
  }
  Logger.log(log.join('|'));
  return log.join('|');
}

// Sends all four player-facing emails to you so you can eyeball them.
// Run this from the editor, then check chris@zstudios.com.
function diagPreviewEmails() {
  var url = WEB_APP_URL + '?cancel=PREVIEW-TOKEN';
  MailApp.sendEmail({
    to: SGF_ADMIN, name: 'SGF Saturday Golf Friends', replyTo: SGF_REPLY_TO,
    subject: '[PREVIEW] You\'re signed up: September 26, 2026 - Ojai Valley Inn at 11:00 AM',
    body:     buildSignupText('Steven Snyder', 'September 26, 2026', 'Ojai Valley Inn', '11:00 AM', 'Looking forward to it', url),
    htmlBody: buildSignupHtml('Steven Snyder', 'September 26, 2026', 'Ojai Valley Inn', '11:00 AM', 'Looking forward to it', url)
  });
  MailApp.sendEmail({
    to: SGF_ADMIN, name: 'SGF Saturday Golf Friends',
    subject: '[PREVIEW] SGF Signup: Steven Snyder - September 26, 2026 - Ojai Valley Inn at 11:00 AM',
    body:     'Plain-text version.',
    htmlBody: buildAdminSignupHtml('Steven Snyder', 'stevensnyder123@sbcglobal.net', 'September 26, 2026', 'Ojai Valley Inn', '11:00 AM', '', 'Looking forward to it', true)
  });
  MailApp.sendEmail({
    to: SGF_ADMIN, name: 'SGF Saturday Golf Friends', replyTo: SGF_REPLY_TO,
    subject: '[PREVIEW] Your spot is cancelled: September 26, 2026 - Ojai Valley Inn at 11:00 AM',
    body:     buildCancelText('Steven Snyder', 'September 26, 2026', 'Ojai Valley Inn', '11:00 AM'),
    htmlBody: buildCancelHtml('Steven Snyder', 'September 26, 2026', 'Ojai Valley Inn', '11:00 AM')
  });
  MailApp.sendEmail({
    to: SGF_ADMIN, name: 'SGF Saturday Golf Friends', replyTo: SGF_REPLY_TO,
    subject: '[PREVIEW] A spot just opened up: September 26, 2026 - Ojai Valley Inn',
    body:     buildWaitlistText('Steven Snyder', 'September 26, 2026 - Ojai Valley Inn'),
    htmlBody: buildWaitlistHtml('Steven Snyder', 'September 26, 2026 - Ojai Valley Inn')
  });
  return 'Sent 4 preview emails to ' + SGF_ADMIN;
}

