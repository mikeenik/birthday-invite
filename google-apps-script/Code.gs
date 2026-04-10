function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RSVP');
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('RSVP');
      sheet.appendRow(['createdAt', 'guestName', 'attendance', 'drinks', 'comment']);
    }

    var payload = JSON.parse(e.postData.contents || '{}');
    sheet.appendRow([
      payload.createdAt || new Date().toISOString(),
      payload.guestName || '',
      payload.attendance || '',
      Array.isArray(payload.drinks) ? payload.drinks.join(', ') : '',
      payload.comment || '',
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
