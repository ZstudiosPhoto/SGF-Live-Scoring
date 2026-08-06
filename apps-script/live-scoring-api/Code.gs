/**
 * SGF LIVE SCORING - WEB APP  (standalone)
 * ---------------------------------------------------------------------------
 * One script, one deployment, one owner (chris@zstudios.com).
 *
 * Replaces the unidentified web app the Live Scoring app has been calling.
 * It is STANDALONE on purpose: it takes the spreadsheet id as a parameter and
 * opens it by id, so it is NOT copied every time you copy the master sheet.
 * That is what produced eleven identically-named projects.
 *
 * DEPLOY
 *   Deploy > New deployment > Web app
 *     Execute as:      Me
 *     Who has access:  Anyone
 *   Copy the /exec URL and send it to Claude to bake into index.html.
 *   AFTER THE FIRST DEPLOY, only ever use:
 *     Deploy > Manage deployments > pencil > Version: New version > Deploy
 *   "New deployment" mints a NEW URL and silently breaks the live app.
 *
 * ENDPOINTS
 *   GET  ?action=ping
 *   GET  ?action=loadSetup&token=..&sheetId=..[&nocache=1]
 *   GET  ?action=loadMoneySetup&token=..&sheetId=..
 *   POST {type:'scores'|'closies'|'settle', ...}
 *
 * EVERY RESPONSE IS JSON with a "status" field, so the app can finally tell a
 * success from a failure instead of guessing behind mode:'no-cors'.
 *
 * TEXT RULE: keep every string in this file ASCII-only. Smart quotes and em
 * dashes arrive in email as mojibake ("a<U+0080><U+0094>"). Same rule as the signup app.
 */

var SGF_TOKEN   = 'SGF-LIVE-2026';
var ADMIN_EMAIL = 'golf@zstudios.com';
var CACHE_SECS  = 300;          // loadSetup cache; bypass with &nocache=1
var MAX_ROWS    = 32;           // the workbook supports 32 players

// ---------------------------------------------------------------------------
// PLUMBING
// ---------------------------------------------------------------------------

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(msg, extra) {
  var out = { status: 'error', message: String(msg) };
  if (extra) { for (var k in extra) out[k] = extra[k]; }
  Logger.log('SGF ERROR: ' + msg);
  return json_(out);
}

function openSheet_(id) {
  if (!id) throw new Error('No spreadsheetId supplied.');
  return SpreadsheetApp.openById(String(id).trim());
}

function tab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet tab "' + name + '" not found in this workbook.');
  return sh;
}

function norm_(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Pull a number out of a cell that may be "$162", "45%", 162 or "162".
function num_(v) {
  if (typeof v === 'number') return v;
  var s = String(v == null ? '' : v).replace(/[$,\s]/g, '');
  if (s === '' || s.indexOf('%') > -1) return null;
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  try {
    if (p.action === 'ping') {
      return json_({ status: 'ok', app: 'SGF Live Scoring Web App', time: new Date().toISOString() });
    }
    if (p.token !== SGF_TOKEN) return fail_('Bad or missing token.');

    if (p.action === 'loadSetup')      return json_(loadSetup_(p.sheetId, p.nocache === '1'));
    if (p.action === 'loadMoneySetup') return json_(loadMoneySetup_(p.sheetId));

    return fail_('Unknown action: ' + (p.action || '(none)'));
  } catch (err) {
    return fail_(err.message);
  }
}

/**
 * SETUP.PLAYERS -> players[] (cols B..N per row) + groups[] + SETUP.COURSE grid.
 *
 * The app indexes each player row as:
 *   0 name(B)  1 index(C)  3 courseTee(E)  4 rating(F)  5 slope(G)
 *   6 par(H)   7 courseHcp(I)              12 NO$ flag(N)
 * so the block MUST start at column B and be 13 wide. Do not "tidy" this.
 *
 * The header row is located by looking for "Player Name" rather than assuming
 * row 12, so an inserted row at the top does not silently shift every player.
 */
function loadSetup_(sheetId, noCache) {
  var cache = CacheService.getScriptCache();
  var key   = 'setup_' + sheetId;
  if (!noCache) {
    var hit = cache.get(key);
    if (hit) { var o = JSON.parse(hit); o.cached = true; return o; }
  }

  var ss = openSheet_(sheetId);
  var sp = tab_(ss, 'SETUP.PLAYERS');

  var scan = sp.getRange(1, 1, Math.min(30, sp.getLastRow()), 20).getValues();
  var headerRow = -1;
  for (var r = 0; r < scan.length; r++) {
    for (var c = 0; c < scan[r].length; c++) {
      if (norm_(scan[r][c]) === 'player name') { headerRow = r; break; }
    }
    if (headerRow > -1) break;
  }
  if (headerRow < 0) throw new Error('Could not find the "Player Name" header in SETUP.PLAYERS.');

  var firstPlayerRow = headerRow + 2;                 // 1-based, row after the header
  var avail = sp.getLastRow() - firstPlayerRow + 1;
  var rowCount = Math.max(0, Math.min(MAX_ROWS, avail));
  var players = rowCount ? sp.getRange(firstPlayerRow, 2, rowCount, 13).getValues() : [];

  // Optional "Group" column. The June 2026 changelog says one was added; this
  // workbook does not currently have it, and Chris assigns groups in the app.
  // So: use it if it exists, otherwise return [] and every player defaults to 1.
  var groups = [];
  var groupCol = -1;
  for (var gc = 0; gc < scan[headerRow].length; gc++) {
    if (norm_(scan[headerRow][gc]) === 'group') { groupCol = gc + 1; break; }
  }
  if (groupCol > 0 && rowCount) {
    groups = sp.getRange(firstPlayerRow, groupCol, rowCount, 1)
               .getValues().map(function (r) { return r[0]; });
  }

  // Whole SETUP.COURSE grid. The app finds the "Par" and "Handicap Hole" rows
  // itself, so send it as-is rather than guessing at coordinates here.
  var course = [];
  try { course = tab_(ss, 'SETUP.COURSE').getDataRange().getValues(); }
  catch (ce) { Logger.log('SETUP.COURSE missing: ' + ce.message); }

  var out = {
    status: 'ok',
    players: players,
    groups: groups,
    course: course,
    playerRowStart: firstPlayerRow,
    groupColumnFound: groupCol > 0,
    cached: false
  };
  try { cache.put(key, JSON.stringify(out), CACHE_SECS); } catch (pe) {}
  return out;
}

/**
 * SETUP.MONEY -> {totalPot, closiesPool, closiePerHole, skinsPool, lowNet1, lowNet2}
 *
 * Matched on the LABEL TEXT, then the first number to its right on the same
 * row. Percent cells are skipped by num_(), so "Closies % of Total Pot: 25%"
 * cannot be mistaken for a dollar amount. Moving a column will not break this.
 */
function loadMoneySetup_(sheetId) {
  var ss   = openSheet_(sheetId);
  var rows = tab_(ss, 'SETUP.MONEY').getDataRange().getValues();

  // Some keys have a PRECISE pattern and a looser FALLBACK.  The fallback must only be
  // used when the precise one matched nothing ANYWHERE in the tab - otherwise whichever
  // label happens to sit higher in the sheet wins, which is not what we mean.
  //
  // That is exactly what went wrong: "FULL-FEE POT (NO CLOSIE-ONLY PLAYERS):" sits one
  // row ABOVE "TOTAL POT WITH CLOSIE-ONLY PLAYERS:", so the fallback claimed totalPot
  // first and every closie-only buy-in silently vanished from the payouts.  Two passes
  // fixes it: precise patterns first, fallbacks only for whatever is still missing.
  var WANT = [
    { key: 'totalPot',      match: 'total pot with closie-only players' },
    { key: 'totalPot',      match: 'full-fee pot',                       fallback: true },
    { key: 'closiesPool',   match: 'closies pot counting only full-fee' },
    { key: 'closiesPool',   match: 'closies pot',                        fallback: true },
    { key: 'closiePerHole', match: 'nominal closie award' },
    { key: 'skinsPool',     match: 'net skins pool' },
    { key: 'lowNet1',       match: 'low net #1 award' },
    { key: 'lowNet2',       match: 'low net #2 award' }
  ];

  var money = {};
  for (var pass = 0; pass < 2; pass++) {
    var wantFallback = (pass === 1);
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        var label = norm_(rows[r][c]);
        if (!label) continue;
        for (var w = 0; w < WANT.length; w++) {
          if (!!WANT[w].fallback !== wantFallback) continue;   // pass 0 = precise, pass 1 = fallbacks
          if (money[WANT[w].key] != null) continue;            // first match wins
          if (label.indexOf(WANT[w].match) !== 0) continue;
          for (var c2 = c + 1; c2 < rows[r].length; c2++) {
            var n = num_(rows[r][c2]);
            if (n != null) { money[WANT[w].key] = n; break; }
          }
        }
      }
    }
  }

  var found = 0;
  for (var k in money) if (money[k] != null) found++;
  if (!found) return { status: 'error', message: 'No money labels matched in SETUP.MONEY.' };

  return { status: 'ok', money: money };
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (pe) {
    return fail_('Body was not valid JSON.');
  }
  try {
    if (body.token && body.token !== SGF_TOKEN) return fail_('Bad token.');
    var type = body.type || 'scores';
    if (type === 'scores')  return json_(writeScores_(body));
    if (type === 'closies') return json_(writeClosies_(body));
    if (type === 'settle')  return json_(writeSettle_(body));
    return fail_('Unknown POST type: ' + type);
  } catch (err) {
    return fail_(err.message);
  }
}

// Player name -> row number, for a tab that lists names down column A.
function nameRowMap_(sheet, firstRow, lastRow) {
  var names = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 1).getValues();
  var map = {};
  for (var i = 0; i < names.length; i++) {
    var n = norm_(names[i][0]);
    if (n && !map[n]) map[n] = firstRow + i;
  }
  return map;
}

/**
 * GROSS.SCORES: col B = OUT comma string (drives G-O), col D = IN (drives P-X).
 * Only B and D are touched. The G-X cells are FORMULAS - writing them destroys
 * the sheet, which is the bug the June 2026 changelog is still apologising for.
 */
function writeScores_(body) {
  var ss = openSheet_(body.spreadsheetId);
  var gs = tab_(ss, 'GROSS.SCORES');
  var map = nameRowMap_(gs, 5, 36);

  var wrote = [], missing = [];
  (body.players || []).forEach(function (p) {
    var row = map[norm_(p.name)];
    if (!row) { missing.push(p.name); return; }
    gs.getRange(row, 2).setValue(p.out == null ? '' : String(p.out));
    gs.getRange(row, 4).setValue(p.in  == null ? '' : String(p.in));
    wrote.push(p.name);
  });
  SpreadsheetApp.flush();

  return {
    status: missing.length ? 'partial' : 'ok',
    written: wrote.length,
    notFound: missing,
    message: missing.length
      ? (wrote.length + ' written; no row in GROSS.SCORES for: ' + missing.join(', '))
      : (wrote.length + ' player scores written.')
  };
}

/**
 * CLOSIES: the entry grid is ONE COLUMN PER PAR 3, not per hole. Column B is
 * the first par 3, C the second, and so on - so at Las Posas (par 3s on 2, 6,
 * 9, 11, 13) a closie on hole 11 lands in column E. The app sends its closies
 * array already in par-3 order, so the array index IS the column offset.
 *
 * Each column is cleared before writing, so un-assigning a closie in the app
 * clears it here too instead of leaving a stale X behind.
 *
 * NO$ players (SETUP.PLAYERS col N = "X") are skipped, mirroring the onEdit
 * guard on the sheet - onEdit does not fire for script writes.
 */
function writeClosies_(body) {
  var ss = openSheet_(body.spreadsheetId);
  var cl = tab_(ss, 'CLOSIES');
  var map = nameRowMap_(cl, 5, 36);

  var noDollar = {};
  try {
    var setup = loadSetup_(body.spreadsheetId, true);
    setup.players.forEach(function (r) {
      if (String(r[12] || '').trim().toUpperCase() === 'X') noDollar[norm_(r[0])] = true;
    });
  } catch (ne) { Logger.log('NO$ lookup skipped: ' + ne.message); }

  var list = body.closies || [], wrote = [], skipped = [];
  for (var i = 0; i < list.length; i++) {
    var col = 2 + i;                                   // B, C, D, ...
    cl.getRange(5, col, 32, 1).clearContent();
    var nm = norm_(list[i].name);
    if (!nm) continue;
    if (noDollar[nm]) { skipped.push(list[i].name + ' (NO$)'); continue; }
    var row = map[nm];
    if (!row) { skipped.push(list[i].name + ' (no row)'); continue; }
    cl.getRange(row, col).setValue('X');
    wrote.push('H' + list[i].hole + ' ' + list[i].name);
  }
  SpreadsheetApp.flush();

  return {
    status: skipped.length ? 'partial' : 'ok',
    written: wrote.length,
    skipped: skipped,
    message: wrote.length + ' closies written' + (skipped.length ? '; skipped: ' + skipped.join(', ') : '.')
  };
}

/**
 * Settle-up record -> a PAYMENTS tab, and optionally an email to ADMIN_EMAIL.
 * The tab is rebuilt from scratch each push so it always matches the app.
 */
function writeSettle_(body) {
  var ss = openSheet_(body.spreadsheetId);
  var sh = ss.getSheetByName('PAYMENTS');
  if (!sh) sh = ss.insertSheet('PAYMENTS');
  sh.clear();

  var course = String(body.course || '');
  var date   = String(body.date || '');
  var rows   = body.rows || [];

  var out = [];
  out.push(['SGF PLAYER PAYMENTS', course, date, '', '', '']);
  out.push(['', '', '', '', '', '']);
  out.push(['Player', 'Amount paid', 'Paid for games', 'Won $', 'Winnings paid back', 'Settled?']);

  var owedNames = [], totalWon = 0, totalCollected = 0;
  rows.forEach(function (r) {
    var won = Number(r.won || 0);
    totalWon += won;
    var settled = (won <= 0) ? 'n/a' : (r.paidBack ? 'YES' : 'NO');
    if (won > 0 && !r.paidBack) owedNames.push(r.name + ' $' + won + (r.paidIn ? ' (' + r.paidIn + ')' : ''));
    var amt = Number(r.amount || 0);
    totalCollected += amt;
    out.push([r.name || '', amt > 0 ? amt : '', r.paidIn || '', won > 0 ? won : '', r.paidBack || '', settled]);
  });

  out.push(['', '', '', '', '', '']);
  out.push(['Total collected', totalCollected, '', 'Total pot', Number(body.totalPot || 0), '']);
  out.push(['Recorded', new Date(), '', 'Total winnings', totalWon, '']);
  out.push(['', '', '', 'Still owed', owedNames.length, '']);

  sh.getRange(1, 1, out.length, 6).setValues(out);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold').setFontSize(12);
  sh.getRange(3, 1, 1, 6).setFontWeight('bold').setBackground('#1a4a1a').setFontColor('#ffffff');
  // Highlight anyone who won money and has not been paid back.
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i].won || 0) > 0 && !rows[i].paidBack) {
      sh.getRange(4 + i, 1, 1, 6).setBackground('#ffe0b2');
    }
  }
  if (rows.length) sh.getRange(4, 2, rows.length, 1).setNumberFormat('$#,##0.00');
  sh.autoResizeColumns(1, 6);
  SpreadsheetApp.flush();

  var emailed = false, emailError = '';
  if (body.email) {
    try {
      var lines = [];
      lines.push('SGF SETTLE-UP SUMMARY');
      lines.push(course + '  ' + date);
      lines.push('');
      rows.forEach(function (r) {
        var won = Number(r.won || 0);
        lines.push(pad_(r.name || '', 22)
          + ' paid: ' + pad_(Number(r.amount || 0) > 0 ? ('$' + Number(r.amount).toFixed(2)) : '-', 9)
          + ' paid in: ' + pad_(r.paidIn || '-', 8)
          + ' won: ' + pad_(won > 0 ? ('$' + won) : '-', 7)
          + ' paid back: ' + (won > 0 ? (r.paidBack || 'NOT YET') : '-'));
      });
      lines.push('');
      lines.push('Total collected: $' + totalCollected.toFixed(2));
      lines.push('Total pot: $' + Number(body.totalPot || 0) + '   Total winnings: $' + totalWon);
      lines.push(owedNames.length
        ? ('STILL OWED: ' + owedNames.join('; '))
        : 'Everyone who won has been paid back.');
      lines.push('');
      lines.push('Sent automatically by the SGF Live Scoring app.');

      MailApp.sendEmail(ADMIN_EMAIL,
        'SGF settle-up - ' + (course || 'round') + ' - ' + (date || ''),
        lines.join('\n'));
      emailed = true;
    } catch (me) {
      emailError = me.message;
      Logger.log('Settle email failed: ' + me.message);
    }
  }

  return {
    status: 'ok',
    players: rows.length,
    stillOwed: owedNames.length,
    emailed: emailed,
    emailError: emailError,
    message: rows.length + ' players written to the PAYMENTS tab'
      + (body.email ? (emailed ? ' and emailed.' : ' (email FAILED: ' + emailError + ')') : '.')
  };
}

function pad_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

// ---------------------------------------------------------------------------
// SELF-TEST - run this from the editor before you trust a deployment.
// Set TEST_SHEET_ID to the event sheet, press Run, read the Execution log.
// It only READS. It writes nothing.
// ---------------------------------------------------------------------------

var TEST_SHEET_ID = '1jxEgGG-ydQTLg22lky6miYtuznf60XD0WmIH5LLbEco';

function selfTest() {
  var log = [];
  try {
    var s = loadSetup_(TEST_SHEET_ID, true);
    var named = s.players.filter(function (r) {
      var n = String(r[0] || '').trim();
      return n && n.charAt(0) !== '#' && norm_(n) !== 'player name';
    });
    log.push('loadSetup: ' + named.length + ' players, first = ' + named[0][0]);
    log.push('  index=' + named[0][1] + ' tee=' + named[0][3] + ' rating=' + named[0][4]
             + ' slope=' + named[0][5] + ' par=' + named[0][6] + ' courseHcp=' + named[0][7]);
    log.push('  Group column present: ' + s.groupColumnFound);
    log.push('  SETUP.COURSE rows: ' + s.course.length);

    var parRow = null, siRow = null;
    s.course.forEach(function (r) {
      for (var i = 0; i < 3 && i < r.length; i++) {
        var v = norm_(r[i]);
        if (v === 'par') parRow = r;
        if (/^(handicap( hole)?|hcp|stroke ?index|si|hdcp)$/.test(v)) siRow = r;
      }
    });
    log.push('  Par row found: ' + !!parRow + '   Stroke-index row found: ' + !!siRow);

    var m = loadMoneySetup_(TEST_SHEET_ID);
    log.push('loadMoneySetup: ' + JSON.stringify(m.money));
  } catch (e) {
    log.push('FAILED: ' + e.message);
  }
  Logger.log(log.join('\n'));
  return log.join('\n');
}
