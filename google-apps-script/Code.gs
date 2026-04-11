function doPost(e) {
  try {
    var ss = getSpreadsheet_();
    if (!ss) {
      throw new Error(
        'Нет таблицы: открой скрипт из меню Таблицы (Extensions → Apps Script) или задай SPREADSHEET_ID в Script properties',
      );
    }
    var sheet = ss.getSheetByName('RSVP');
    if (!sheet) {
      sheet = ss.insertSheet('RSVP');
      sheet.appendRow([
        'createdAt',
        'guestName',
        'attendance',
        'drinks',
        'comment',
        'maybeFollowUp',
        'outcome',
      ]);
    }

    var payload = JSON.parse(e.postData.contents || '{}');
    sheet.appendRow([
      payload.createdAt || new Date().toISOString(),
      payload.guestName || '',
      payload.attendance || '',
      Array.isArray(payload.drinks) ? payload.drinks.join(', ') : '',
      payload.comment || '',
      payload.maybeFollowUp || '',
      payload.outcome || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET: список ответов для сайта. Параметр callback=имяФункции — JSONP (нужен для запроса с GitHub Pages).
 */
function doGet(e) {
  try {
    var callback = e.parameter.callback;
    var data = { ok: true, rows: getAllRows_() };
    var json = JSON.stringify(data);
    if (callback && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(callback)) {
      return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(
        ContentService.MimeType.JAVASCRIPT,
      );
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    var err = JSON.stringify({ ok: false, error: String(error) });
    var cb = e.parameter.callback;
    if (cb && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cb)) {
      return ContentService.createTextOutput(cb + '(' + err + ');').setMimeType(
        ContentService.MimeType.JAVASCRIPT,
      );
    }
    return ContentService.createTextOutput(err).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    return ss;
  }
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  return null;
}

/** Совпадает с порядком колонок в doPost / appendRow (A–G). */
var RSVP_COLUMN_KEYS_ = [
  'createdAt',
  'guestName',
  'attendance',
  'drinks',
  'comment',
  'maybeFollowUp',
  'outcome',
];

function normalizeCellForJson_(cell) {
  if (cell == null || cell === '') {
    return '';
  }
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  return cell;
}

function getAllRows_() {
  var ss = getSpreadsheet_();
  if (!ss) {
    return [];
  }
  var sheet = ss.getSheetByName('RSVP');
  if (!sheet) {
    return [];
  }
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    var n = RSVP_COLUMN_KEYS_.length;
    for (var j = 0; j < n; j++) {
      var cell = j < row.length ? row[j] : '';
      obj[RSVP_COLUMN_KEYS_[j]] = normalizeCellForJson_(cell);
    }
    rows.push(obj);
  }
  rows.reverse();
  return rows;
}
