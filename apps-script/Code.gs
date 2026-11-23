// ===== 서대문형무소역사관 현장체험학습 독립 백엔드 (Apps Script) =====
// 기존 '학습지 허브'와 완전히 별개의 새 구글 시트에서 실행하세요.
//
// 설치 순서 (약 2분):
// 1. 새 구글 시트를 만들고 메뉴 [확장 프로그램 > Apps Script]를 엽니다.
// 2. 기존 코드를 모두 지우고 이 파일 전체를 붙여넣은 뒤 저장합니다.
// 3. 프로젝트 설정(톱니바퀴)에서 시간대를 "(GMT+09:00) 서울"로 설정합니다.
// 4. 위쪽 함수 목록에서 setup 을 선택하고 [실행] -> 권한 허용.
// 5. [배포 > 새 배포] -> 유형: 웹 앱 / 실행 주체: 나 / 액세스 권한: 모든 사용자 -> 배포.
// 6. 발급된 웹 앱 URL(/exec)을 config.js 의 apiUrl 에 입력하고 저장합니다.

const DEFAULT_TEACHER_PIN = 'seodaemun2026';
const CLASS_LIST = [1, 2, 3, 4, 5, 6, 7];

const SHEET_ALL = '전체제출';
const SHEET_SELECTED = '선정명단';
const SHEET_ROSTER = '명렬표';

const PROP_SHEET_ID = 'SEODAEMUN_SHEET_ID';
const PROP_TEACHER_PIN = 'SEODAEMUN_TEACHER_PIN';

const HEADERS_ROSTER = ['반', '번호', '학번', '이름'];

const HEADERS_SUBMISSION = [
  '제출시각',
  '반',
  '번호',
  '학번',
  '이름',
  '활동지',
  '점수',
  '만점',
  '정답률(%)',
  '제출차수',
  '틀린문항',
  '활동1_생각해보기',
  '선택공간_인물',
  '나만의기록_이유',
  '20번_소감다짐',
  '소감글자수',
  '답안JSON'
];

const HEADERS_SELECTED = [
  '반',
  '학번',
  '이름',
  '대표정답률(%)',
  '선정방식',
  '선정시각',
  '비고'
];

function setup() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('다른 작업이 진행 중입니다. 잠시 후 setup을 다시 실행해 주세요.');
  }
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book) {
      throw new Error('구글 시트의 [확장 프로그램 > Apps Script]에서 열어 실행해 주세요.');
    }

    ensureSheetWithHeader_(book, SHEET_ALL, HEADERS_SUBMISSION, [
      155, 55, 55, 75, 85, 85, 55, 55, 85, 75, 160, 260, 140, 260, 320, 85, 280
    ]);

    CLASS_LIST.forEach(function (c) {
      ensureSheetWithHeader_(book, c + '반', HEADERS_SUBMISSION, [
        155, 55, 55, 75, 85, 85, 55, 55, 85, 75, 160, 260, 140, 260, 320, 85, 280
      ]);
    });

    ensureSheetWithHeader_(book, SHEET_SELECTED, HEADERS_SELECTED, [
      55, 75, 90, 110, 110, 160, 220
    ]);

    SpreadsheetApp.flush();

    const props = PropertiesService.getScriptProperties();
    props.setProperty(PROP_SHEET_ID, book.getId());
    if (!props.getProperty(PROP_TEACHER_PIN)) {
      props.setProperty(PROP_TEACHER_PIN, DEFAULT_TEACHER_PIN);
    }
    console.log('설치 완료! 이제 [배포 > 새 배포 > 웹 앱(모든 사용자)]으로 배포하세요.');
  } finally {
    lock.releaseLock();
  }
}

/**
 * 교사용 대시보드 비밀번호를 변경하고 싶을 때 Apps Script 편집기에서 직접 호출하세요.
 */
function setTeacherPin(newPin) {
  const clean = String(newPin || '').trim();
  if (clean.length < 4) {
    throw new Error('비밀번호는 4자 이상으로 설정해 주세요.');
  }
  PropertiesService.getScriptProperties().setProperty(PROP_TEACHER_PIN, clean);
  console.log('교사용 비밀번호가 변경되었습니다.');
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || 'ping');

  if (action === 'ping') {
    return jsonResponse_({
      ok: true,
      service: 'seodaemun-fieldtrip',
      serverTime: formatSeoulNow_()
    });
  }

  if (action === 'dashboard') {
    if (!verifyPin_(params.pin)) {
      return jsonResponse_({ ok: false, error: 'INVALID_PIN' });
    }
    const book = getSpreadsheet_();
    const submissions = readSubmissions_(book);
    const selections = readSelections_(book);
    const roster = readRoster_(book);
    return jsonResponse_({
      ok: true,
      serverTime: formatSeoulNow_(),
      submissions: submissions,
      selections: selections,
      roster: roster
    });
  }

  return jsonResponse_({ ok: false, error: 'UNKNOWN_ACTION' });
}

function doPost(e) {
  let body = {};
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    body = JSON.parse(raw);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'INVALID_JSON' });
  }

  const action = String(body.action || '');
  if (action === 'submit') {
    return handleSubmit_(body);
  }
  if (action === 'saveSelection') {
    return handleSaveSelection_(body);
  }
  if (action === 'deleteSubmission') {
    return handleDeleteSubmission_(body);
  }
  return jsonResponse_({ ok: false, error: 'UNKNOWN_ACTION' });
}

function handleSubmit_(body) {
  const classNo = Number(body.classNo);
  const number = Number(body.number);
  const name = String(body.name || '').trim();
  const worksheet = String(body.worksheet || '').trim();

  if (CLASS_LIST.indexOf(classNo) === -1) {
    return jsonResponse_({ ok: false, error: 'INVALID_CLASS' });
  }
  if (!number || number < 1 || number > 50 || !name) {
    return jsonResponse_({ ok: false, error: 'INVALID_STUDENT' });
  }
  if (worksheet !== 'basic' && worksheet !== 'leaflet') {
    return jsonResponse_({ ok: false, error: 'INVALID_WORKSHEET' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return jsonResponse_({ ok: false, error: 'SERVER_BUSY' });
  }

  try {
    const book = getSpreadsheet_();
    const allSheet = ensureSheetWithHeader_(book, SHEET_ALL, HEADERS_SUBMISSION);
    const classSheet = ensureSheetWithHeader_(book, classNo + '반', HEADERS_SUBMISSION);

    const studentCode = String(body.studentCode || ('1' + classNo + String(number).padStart(2, '0')));
    const attempt = countPreviousAttempts_(allSheet, studentCode, worksheet) + 1;
    const nowStr = formatSeoulNow_();

    const row = [
      nowStr,
      classNo,
      number,
      studentCode,
      name,
      worksheet,
      Number(body.score) || 0,
      Number(body.total) || 19,
      Number(body.accuracy) || 0,
      attempt,
      String(body.wrongItems || ''),
      String(body.activityThink || ''),
      String(body.selectedPick || ''),
      String(body.reflectionReason || ''),
      String(body.reflection20 || ''),
      Number(body.reflectionLength) || String(body.reflection20 || '').trim().length,
      String(body.answersJson || '{}')
    ];

    allSheet.appendRow(row);
    classSheet.appendRow(row);
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      attempt: attempt,
      serverTime: nowStr
    });
  } finally {
    lock.releaseLock();
  }
}

function handleSaveSelection_(body) {
  if (!verifyPin_(body.pin)) {
    return jsonResponse_({ ok: false, error: 'INVALID_PIN' });
  }
  const classNo = Number(body.classNo);
  if (CLASS_LIST.indexOf(classNo) === -1) {
    return jsonResponse_({ ok: false, error: 'INVALID_CLASS' });
  }
  const winners = Array.isArray(body.winners) ? body.winners : [];

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return jsonResponse_({ ok: false, error: 'SERVER_BUSY' });
  }

  try {
    const book = getSpreadsheet_();
    const selSheet = ensureSheetWithHeader_(book, SHEET_SELECTED, HEADERS_SELECTED);
    const lastRow = selSheet.getLastRow();
    const keptRows = [];

    if (lastRow > 1) {
      const existing = selSheet.getRange(2, 1, lastRow - 1, HEADERS_SELECTED.length).getValues();
      existing.forEach(function (r) {
        if (Number(r[0]) !== classNo && String(r[1] || '').trim() !== '') {
          keptRows.push(r);
        }
      });
    }

    const nowStr = formatSeoulNow_();
    const newRows = winners.map(function (w) {
      return [
        classNo,
        String(w.studentCode || ''),
        String(w.name || ''),
        Number(w.accuracy) || 0,
        String(w.method || '직접선정'),
        String(w.selectedAt || nowStr),
        String(w.note || '')
      ];
    });

    const merged = keptRows.concat(newRows).sort(function (a, b) {
      const ca = Number(a[0]) || 0;
      const cb = Number(b[0]) || 0;
      if (ca !== cb) return ca - cb;
      return String(a[1]).localeCompare(String(b[1]));
    });

    if (lastRow > 1) {
      selSheet.getRange(2, 1, lastRow - 1, HEADERS_SELECTED.length).clearContent();
    }
    if (merged.length > 0) {
      selSheet.getRange(2, 1, merged.length, HEADERS_SELECTED.length).setValues(merged);
    }
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      classNo: classNo,
      savedCount: newRows.length,
      savedAt: nowStr
    });
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteSubmission_(body) {
  if (!verifyPin_(body.pin)) {
    return jsonResponse_({ ok: false, error: 'INVALID_PIN' });
  }
  const classNo = Number(body.classNo);
  const studentCode = String(body.studentCode || '').trim();
  const name = normalizeName_(body.name || '');

  if (CLASS_LIST.indexOf(classNo) === -1) {
    return jsonResponse_({ ok: false, error: 'INVALID_CLASS' });
  }
  if (!studentCode && !name) {
    return jsonResponse_({ ok: false, error: 'INVALID_TARGET' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return jsonResponse_({ ok: false, error: 'SERVER_BUSY' });
  }

  try {
    const book = getSpreadsheet_();
    const deletedAll = deleteMatchingRows_(book.getSheetByName(SHEET_ALL), classNo, studentCode, name, 1, 3, 4);
    const deletedClass = deleteMatchingRows_(book.getSheetByName(classNo + '반'), classNo, studentCode, name, 1, 3, 4);
    deleteMatchingRows_(book.getSheetByName(SHEET_SELECTED), classNo, studentCode, name, 0, 1, 2);
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      deletedAll: deletedAll,
      deletedClass: deletedClass,
      serverTime: formatSeoulNow_()
    });
  } finally {
    lock.releaseLock();
  }
}

function deleteMatchingRows_(sheet, classNo, studentCode, normName, colClass, colCode, colName) {
  if (!sheet || sheet.getLastRow() <= 1) return 0;
  const lastRow = sheet.getLastRow();
  const numCols = Math.max(colClass, colCode, colName) + 1;
  const values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  let deleted = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const r = values[i];
    if (Number(r[colClass]) !== classNo) continue;
    const rowCode = String(r[colCode] || '').trim();
    const rowName = normalizeName_(r[colName] || '');
    const codeMatch = Boolean(studentCode) && rowCode === studentCode;
    const nameMatch = Boolean(normName) && rowName === normName;
    if (codeMatch || nameMatch) {
      sheet.deleteRow(i + 2);
      deleted += 1;
    }
  }
  return deleted;
}

function normalizeName_(val) {
  return String(val == null ? '' : val).replace(/\s+/g, '').trim();
}

function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!id) throw new Error('SPREADSHEET_NOT_INITIALIZED');
  return SpreadsheetApp.openById(id);
}

function verifyPin_(pin) {
  const stored = PropertiesService.getScriptProperties().getProperty(PROP_TEACHER_PIN) || DEFAULT_TEACHER_PIN;
  return String(pin || '').trim() === String(stored).trim();
}

function ensureSheetWithHeader_(book, name, headers, widths) {
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#64261E')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (widths) {
      widths.forEach(function (w, idx) {
        sheet.setColumnWidth(idx + 1, w);
      });
    }
  }
  return sheet;
}

function countPreviousAttempts_(sheet, studentCode, worksheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const values = sheet.getRange(2, 4, lastRow - 1, 3).getValues();
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0]) === String(studentCode) && String(values[i][2]) === String(worksheet)) {
      count += 1;
    }
  }
  return count;
}

function readSubmissions_(book) {
  const sheet = book.getSheetByName(SHEET_ALL);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_SUBMISSION.length).getValues();
  return rows
    .filter(function (r) { return String(r[3] || '').trim() !== ''; })
    .map(function (r) {
      return {
        submittedAt: formatCellDate_(r[0]),
        classNo: Number(r[1]) || 0,
        number: Number(r[2]) || 0,
        studentCode: String(r[3] || ''),
        name: String(r[4] || ''),
        worksheet: String(r[5] || ''),
        score: Number(r[6]) || 0,
        total: Number(r[7]) || 19,
        accuracy: Number(r[8]) || 0,
        attempt: Number(r[9]) || 1,
        wrongItems: String(r[10] || ''),
        activityThink: String(r[11] || ''),
        selectedPick: String(r[12] || ''),
        reflectionReason: String(r[13] || ''),
        reflection20: String(r[14] || ''),
        reflectionLength: Number(r[15]) || 0,
        answersJson: String(r[16] || '{}')
      };
    });
}

function readSelections_(book) {
  const sheet = book.getSheetByName(SHEET_SELECTED);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_SELECTED.length).getValues();
  return rows
    .filter(function (r) { return String(r[1] || '').trim() !== ''; })
    .map(function (r) {
      return {
        classNo: Number(r[0]) || 0,
        studentCode: String(r[1] || ''),
        name: String(r[2] || ''),
        accuracy: Number(r[3]) || 0,
        method: String(r[4] || '직접선정'),
        selectedAt: formatCellDate_(r[5]),
        note: String(r[6] || '')
      };
    });
}

function readRoster_(book) {
  const sheet = book.getSheetByName(SHEET_ROSTER);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_ROSTER.length).getValues();
  return rows
    .filter(function (r) { return Number(r[0]) >= 1 && String(r[3] || '').trim() !== ''; })
    .map(function (r) {
      return {
        classNo: Number(r[0]),
        number: Number(r[1]) || 0,
        studentCode: String(r[2] || ''),
        name: String(r[3] || '').trim()
      };
    });
}

function formatCellDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  }
  return String(val || '');
}

function formatSeoulNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
