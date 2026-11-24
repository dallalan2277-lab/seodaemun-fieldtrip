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

const DEFAULT_TEACHER_PIN = '0625';
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
  '답안JSON',
  '제출ID'
];

const WIDTHS_SUBMISSION = [
  155, 55, 55, 75, 85, 85, 55, 55, 85, 75, 160, 260, 140, 260, 320, 85, 280, 250
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

    ensureSheetWithHeader_(book, SHEET_ALL, HEADERS_SUBMISSION, WIDTHS_SUBMISSION);

    CLASS_LIST.forEach(function (c) {
      ensureSheetWithHeader_(book, c + '반', HEADERS_SUBMISSION, WIDTHS_SUBMISSION);
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
    const allSheet = ensureSheetWithHeader_(book, SHEET_ALL, HEADERS_SUBMISSION, WIDTHS_SUBMISSION);
    const classSheet = ensureSheetWithHeader_(book, classNo + '반', HEADERS_SUBMISSION, WIDTHS_SUBMISSION);

    const studentCode = String(body.studentCode || ('1' + classNo + String(number).padStart(2, '0'))).trim();
    const attempt = countPreviousAttempts_(allSheet, studentCode, name, worksheet) + 1;
    const nowStr = formatSeoulNow_();
    const submissionId = String(body.submissionId || '').trim() || Utilities.getUuid();

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
      String(body.answersJson || '{}'),
      submissionId
    ];

    allSheet.appendRow(row);
    classSheet.appendRow(row);
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      attempt: attempt,
      serverTime: nowStr,
      submissionId: submissionId
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
  const targetCode = String(body.studentCode || '').trim();
  const targetNormName = normalizeName_(body.name || '');
  const isExtra = Boolean(body.isExtra);
  const removeSelectionIfEmpty = body.removeSelectionIfEmpty !== false;

  if (CLASS_LIST.indexOf(classNo) === -1) {
    return jsonResponse_({ ok: false, error: 'INVALID_CLASS' });
  }

  const rawIds = [];
  if (Array.isArray(body.submissionIds)) {
    body.submissionIds.forEach(function (v) { rawIds.push(v); });
  } else if (body.submissionId) {
    rawIds.push(body.submissionId);
  }
  const idMap = {};
  const submissionIds = [];
  rawIds.forEach(function (v) {
    const clean = String(v == null ? '' : v).trim();
    if (clean && !idMap[clean]) {
      idMap[clean] = true;
      submissionIds.push(clean);
    }
  });

  const legacyTargets = [];
  if (Array.isArray(body.legacyTargets)) {
    body.legacyTargets.forEach(function (t) {
      if (!t || typeof t !== 'object') return;
      const tSubmittedAt = String(t.submittedAt || '').trim();
      const tClassNo = Number(t.classNo) || classNo;
      const tCode = String(t.studentCode || '').trim();
      const tName = normalizeName_(t.name || '');
      if (!tSubmittedAt || !tCode || !tName || tClassNo !== classNo) return;
      legacyTargets.push({
        submittedAt: tSubmittedAt,
        classNo: tClassNo,
        number: Number(t.number) || 0,
        studentCode: tCode,
        name: tName,
        attempt: Number(t.attempt) || 1
      });
    });
  }

  if (submissionIds.length === 0 && legacyTargets.length === 0) {
    return jsonResponse_({ ok: false, error: 'INVALID_TARGET' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return jsonResponse_({ ok: false, error: 'SERVER_BUSY' });
  }

  try {
    const book = getSpreadsheet_();
    const allSheet = book.getSheetByName(SHEET_ALL);
    const classSheet = book.getSheetByName(classNo + '반');
    const deletedAll = deleteSubmissionRowsExact_(allSheet, classNo, idMap, legacyTargets);
    const deletedClass = deleteSubmissionRowsExact_(classSheet, classNo, idMap, legacyTargets);

    const remainingCount = countRemainingStudentSubmissions_(allSheet, classNo, targetCode, targetNormName, isExtra);
    let removedSelection = 0;
    if (removeSelectionIfEmpty && remainingCount === 0 && targetCode && targetNormName) {
      removedSelection = deleteSelectionExact_(book.getSheetByName(SHEET_SELECTED), classNo, targetCode, targetNormName);
    }
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      deletedAll: deletedAll,
      deletedClass: deletedClass,
      remainingCount: remainingCount,
      removedSelection: removedSelection,
      serverTime: formatSeoulNow_()
    });
  } finally {
    lock.releaseLock();
  }
}

function getReadableSubmissionColCount_(sheet) {
  if (typeof sheet.getMaxColumns === 'function') {
    const maxCols = Number(sheet.getMaxColumns()) || 0;
    if (maxCols > 0) {
      return Math.min(maxCols, HEADERS_SUBMISSION.length);
    }
  }
  return HEADERS_SUBMISSION.length;
}

function deleteSubmissionRowsExact_(sheet, classNo, idMap, legacyTargets) {
  if (!sheet || sheet.getLastRow() <= 1) return 0;
  const lastRow = sheet.getLastRow();
  const numCols = getReadableSubmissionColCount_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  const remainingLegacy = (legacyTargets || []).slice();
  let deleted = 0;

  for (let i = values.length - 1; i >= 0; i -= 1) {
    const r = values[i];
    if (Number(r[1]) !== classNo) continue;
    const rowId = numCols >= 18 ? String(r[17] || '').trim() : '';
    if (rowId) {
      if (idMap[rowId] === true) {
        sheet.deleteRow(i + 2);
        deleted += 1;
      }
    } else if (remainingLegacy.length > 0) {
      const rowSubmittedAt = formatCellDate_(r[0]);
      const rowNumber = Number(r[2]) || 0;
      const rowCode = String(r[3] || '').trim();
      const rowNormName = normalizeName_(r[4]);
      const rowAttempt = Number(r[9]) || 1;
      let matchIdx = -1;
      for (let j = 0; j < remainingLegacy.length; j += 1) {
        const t = remainingLegacy[j];
        if (
          rowSubmittedAt === t.submittedAt &&
          rowNumber === t.number &&
          rowCode === t.studentCode &&
          rowNormName === t.name &&
          rowAttempt === t.attempt
        ) {
          matchIdx = j;
          break;
        }
      }
      if (matchIdx !== -1) {
        remainingLegacy.splice(matchIdx, 1);
        sheet.deleteRow(i + 2);
        deleted += 1;
      }
    }
  }
  return deleted;
}

function countRemainingStudentSubmissions_(allSheet, classNo, targetCode, targetNormName, isExtra) {
  if (!allSheet || allSheet.getLastRow() <= 1) return 0;
  const lastRow = allSheet.getLastRow();
  const values = allSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const r = values[i];
    if (Number(r[1]) !== classNo) continue;
    const rowCode = String(r[3] || '').trim();
    const rowNormName = normalizeName_(r[4]);
    if (!rowCode && !rowNormName) continue;
    if (isExtra) {
      if (rowCode === targetCode && rowNormName === targetNormName) {
        count += 1;
      }
    } else if ((rowCode === targetCode && rowNormName === targetNormName) || (targetNormName && rowNormName === targetNormName)) {
      count += 1;
    }
  }
  return count;
}

function deleteSelectionExact_(selSheet, classNo, targetCode, targetNormName) {
  if (!selSheet || selSheet.getLastRow() <= 1) return 0;
  const lastRow = selSheet.getLastRow();
  const values = selSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  let deleted = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const r = values[i];
    if (
      Number(r[0]) === classNo &&
      String(r[1] || '').trim() === targetCode &&
      normalizeName_(r[2]) === targetNormName
    ) {
      selSheet.deleteRow(i + 2);
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
  } else {
    if (typeof sheet.getMaxColumns === 'function' && sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    for (let idx = 0; idx < headers.length; idx += 1) {
      if (String(existingHeaders[idx] || '').trim() === '') {
        sheet.getRange(1, idx + 1, 1, 1)
          .setValues([[headers[idx]]])
          .setBackground('#64261E')
          .setFontColor('#ffffff')
          .setFontWeight('bold');
        if (widths && widths[idx]) {
          sheet.setColumnWidth(idx + 1, widths[idx]);
        }
      }
    }
  }
  return sheet;
}

function countPreviousAttempts_(sheet, studentCode, name, worksheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const values = sheet.getRange(2, 4, lastRow - 1, 3).getValues();
  const targetNorm = normalizeName_(name);
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (
      String(values[i][0] || '').trim() === String(studentCode).trim() &&
      normalizeName_(values[i][1]) === targetNorm &&
      String(values[i][2] || '').trim() === String(worksheet).trim()
    ) {
      count += 1;
    }
  }
  return count;
}

function readSubmissions_(book) {
  const sheet = book.getSheetByName(SHEET_ALL);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const numCols = getReadableSubmissionColCount_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).getValues();
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
        answersJson: String(r[16] || '{}'),
        submissionId: numCols >= 18 ? String(r[17] || '').trim() : ''
      };
    });
}

function buildMigrationSignature_(r) {
  return [
    formatCellDate_(r[0]),
    Number(r[1]) || 0,
    Number(r[2]) || 0,
    String(r[3] || '').trim(),
    normalizeName_(r[4]),
    String(r[5] || '').trim(),
    Number(r[6]) || 0,
    Number(r[8]) || 0,
    Number(r[9]) || 1,
    String(r[14] || '').trim(),
    String(r[16] || '').trim()
  ].join('||');
}

/**
 * 기존 제출 행(전체제출 + 1~7반)에 18번째 열 '제출ID'를 추가하고 1:1 일치 건에 동일 UUID를 부여합니다.
 * 두 시트에서 일치 건을 특정하기 어려운(중복/불일치) 행은 임의로 연결하지 않고 로그로 보고합니다.
 */
function migrateSubmissionIds() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('다른 작업이 진행 중입니다. 잠시 후 다시 실행해 주세요.');
  }
  try {
    const book = getSpreadsheet_();
    const allSheet = ensureSheetWithHeader_(book, SHEET_ALL, HEADERS_SUBMISSION, WIDTHS_SUBMISSION);
    const classSheets = {};
    CLASS_LIST.forEach(function (c) {
      classSheets[c] = ensureSheetWithHeader_(book, c + '반', HEADERS_SUBMISSION, WIDTHS_SUBMISSION);
    });

    let alreadyHasIdCount = 0;
    const allByClassAndSig = {};
    if (allSheet.getLastRow() > 1) {
      const allRows = allSheet.getRange(2, 1, allSheet.getLastRow() - 1, HEADERS_SUBMISSION.length).getValues();
      allRows.forEach(function (r, idx) {
        if (String(r[3] || '').trim() === '' && String(r[4] || '').trim() === '') return;
        const existingId = String(r[17] || '').trim();
        if (existingId) {
          alreadyHasIdCount += 1;
          return;
        }
        const c = Number(r[1]) || 0;
        const sig = buildMigrationSignature_(r);
        if (!allByClassAndSig[c]) allByClassAndSig[c] = {};
        if (!allByClassAndSig[c][sig]) allByClassAndSig[c][sig] = [];
        allByClassAndSig[c][sig].push({ rowNum: idx + 2, row: r });
      });
    }

    let linkedCount = 0;
    const needsReview = [];

    CLASS_LIST.forEach(function (c) {
      const cSheet = classSheets[c];
      const classBySig = {};
      if (cSheet.getLastRow() > 1) {
        const cRows = cSheet.getRange(2, 1, cSheet.getLastRow() - 1, HEADERS_SUBMISSION.length).getValues();
        cRows.forEach(function (r, idx) {
          if (String(r[3] || '').trim() === '' && String(r[4] || '').trim() === '') return;
          if (String(r[17] || '').trim()) return;
          const sig = buildMigrationSignature_(r);
          if (!classBySig[sig]) classBySig[sig] = [];
          classBySig[sig].push({ rowNum: idx + 2, row: r });
        });
      }

      const allForClass = allByClassAndSig[c] || {};
      const sigSeen = {};
      const allSigs = [];
      Object.keys(allForClass).forEach(function (s) {
        if (!sigSeen[s]) { sigSeen[s] = true; allSigs.push(s); }
      });
      Object.keys(classBySig).forEach(function (s) {
        if (!sigSeen[s]) { sigSeen[s] = true; allSigs.push(s); }
      });

      allSigs.forEach(function (sig) {
        const allMatches = allForClass[sig] || [];
        const classMatches = classBySig[sig] || [];
        if (allMatches.length === 1 && classMatches.length === 1) {
          const newId = Utilities.getUuid();
          allSheet.getRange(allMatches[0].rowNum, 18, 1, 1).setValues([[newId]]);
          cSheet.getRange(classMatches[0].rowNum, 18, 1, 1).setValues([[newId]]);
          linkedCount += 1;
        } else {
          const sample = (allMatches[0] || classMatches[0]).row;
          let reason = 'AMBIGUOUS';
          if (allMatches.length === 0) reason = 'UNMATCHED_IN_ALL';
          else if (classMatches.length === 0) reason = 'UNMATCHED_IN_CLASS';
          needsReview.push({
            reason: reason,
            classNo: c,
            allRows: allMatches.map(function (m) { return m.rowNum; }),
            classRows: classMatches.map(function (m) { return m.rowNum; }),
            submittedAt: formatCellDate_(sample[0]),
            studentCode: String(sample[3] || '').trim(),
            name: String(sample[4] || '').trim()
          });
        }
      });
    });

    Object.keys(allByClassAndSig).forEach(function (cKey) {
      const cNum = Number(cKey);
      if (CLASS_LIST.indexOf(cNum) !== -1) return;
      const map = allByClassAndSig[cKey];
      Object.keys(map).forEach(function (sig) {
        const matches = map[sig];
        const sample = matches[0].row;
        needsReview.push({
          reason: 'UNMATCHED_IN_CLASS',
          classNo: cNum,
          allRows: matches.map(function (m) { return m.rowNum; }),
          classRows: [],
          submittedAt: formatCellDate_(sample[0]),
          studentCode: String(sample[3] || '').trim(),
          name: String(sample[4] || '').trim()
        });
      });
    });

    SpreadsheetApp.flush();
    console.log(
      '제출ID 마이그레이션 완료: 1:1 연결 ' + linkedCount + '건, 기존 ID 보유(전체제출) ' +
      alreadyHasIdCount + '건, 교사 확인 필요 ' + needsReview.length + '건'
    );
    if (needsReview.length > 0) {
      console.log('교사 확인 필요 목록: ' + JSON.stringify(needsReview));
    }

    return {
      ok: true,
      linkedCount: linkedCount,
      alreadyHasIdCount: alreadyHasIdCount,
      needsReview: needsReview
    };
  } finally {
    lock.releaseLock();
  }
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
