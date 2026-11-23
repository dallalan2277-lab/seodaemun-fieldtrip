'use strict';

(function (root) {
  const SESSION_PIN_KEY = 'seodaemun_teacher_pin';
  const DEMO_SUBMISSIONS_KEY = 'seodaemun_demo_submissions';
  const DEMO_SELECTIONS_KEY = 'seodaemun_demo_selections';

  function normalizeName(value) {
    return String(value == null ? '' : value).replace(/\s+/g, '').trim();
  }

  function escapeCsvCell(value) {
    const str = String(value == null ? '' : value);
    if (/[",\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function generateCsv(headers, rows) {
    const lines = [headers.map(escapeCsvCell).join(',')];
    rows.forEach(function (row) {
      lines.push(row.map(escapeCsvCell).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function base64ToBytes(b64) {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  function getSubtleCrypto() {
    if (typeof root !== 'undefined' && root.crypto && root.crypto.subtle) {
      return root.crypto.subtle;
    }
    if (typeof require === 'function') {
      return require('crypto').webcrypto.subtle;
    }
    return null;
  }

  async function decryptRoster(encryptedObj, pin) {
    if (!encryptedObj || !encryptedObj.data) {
      throw new Error('ROSTER_MISSING');
    }
    const subtle = getSubtleCrypto();
    if (!subtle) {
      throw new Error('CRYPTO_UNAVAILABLE');
    }
    const enc = new TextEncoder();
    const salt = base64ToBytes(encryptedObj.salt);
    const iv = base64ToBytes(encryptedObj.iv);
    const cipherBytes = base64ToBytes(encryptedObj.data);
    const baseKey = await subtle.importKey('raw', enc.encode(String(pin || '')), 'PBKDF2', false, ['deriveKey']);
    const aesKey = await subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: encryptedObj.iterations || 150000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    try {
      const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, cipherBytes);
      const parsed = JSON.parse(new TextDecoder().decode(plainBuf));
      if (!Array.isArray(parsed)) throw new Error('INVALID_ROSTER');
      return parsed;
    } catch (e) {
      throw new Error('INVALID_PIN');
    }
  }

  /**
   * 실제 명렬표와 제출 내역을 병합해 학생별 제출·미제출 상태를 산출합니다.
   * - 공식 정답률은 1차 제출 기준, 소감·다짐은 최신 제출 기준입니다.
   * - 명단에 없는 테스트 제출 등은 isExtra: true (명단 외) 로 분리해 삭제/관리할 수 있습니다.
   */
  function mergeRosterWithSubmissions(roster, submissions) {
    const entries = {};
    const byClassAndNumName = {};
    const byClassAndName = {};

    (roster || []).forEach(function (r) {
      const classNo = Number(r.classNo);
      const number = Number(r.number);
      const studentCode = String(r.studentCode || ('1' + classNo + String(number).padStart(2, '0')));
      const name = String(r.name || '').trim();
      const key = classNo + '_' + studentCode;
      entries[key] = {
        classNo: classNo,
        number: number,
        studentCode: studentCode,
        name: name,
        isExtra: false,
        subs: []
      };
      byClassAndNumName[classNo + '_' + number + '_' + normalizeName(name)] = entries[key];
      if (!byClassAndName[classNo + '_' + normalizeName(name)]) {
        byClassAndName[classNo + '_' + normalizeName(name)] = entries[key];
      }
    });

    const sortedRaw = (submissions || []).slice().sort(function (a, b) {
      const aa = Number(a.attempt) || 1;
      const ba = Number(b.attempt) || 1;
      if (aa !== ba) return aa - ba;
      return String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''));
    });

    sortedRaw.forEach(function (sub) {
      const classNo = Number(sub.classNo) || 0;
      const num = Number(sub.number) || 0;
      const norm = normalizeName(sub.name);
      let target = byClassAndNumName[classNo + '_' + num + '_' + norm];
      if (!target) {
        target = byClassAndName[classNo + '_' + norm];
      }
      if (!target) {
        const extraCode = String(sub.studentCode || ('1' + classNo + String(num).padStart(2, '0')));
        const extraKey = 'extra_' + classNo + '_' + extraCode + '_' + norm;
        if (!entries[extraKey]) {
          entries[extraKey] = {
            classNo: classNo,
            number: num,
            studentCode: extraCode,
            name: String(sub.name || '').trim(),
            isExtra: true,
            subs: []
          };
        }
        target = entries[extraKey];
      }
      target.subs.push(sub);
    });

    return Object.keys(entries).map(function (key) {
      const entry = entries[key];
      const subs = entry.subs.slice().sort(function (a, b) {
        const aa = Number(a.attempt) || 1;
        const ba = Number(b.attempt) || 1;
        if (aa !== ba) return aa - ba;
        return String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''));
      });

      if (subs.length === 0) {
        return {
          classNo: entry.classNo,
          number: entry.number,
          studentCode: entry.studentCode,
          name: entry.name,
          isExtra: entry.isExtra,
          submitted: false,
          attempts: 0,
          score: null,
          total: 19,
          accuracy: null,
          wrongItems: '',
          activityThink: '',
          selectedPick: '',
          reflectionReason: '',
          reflection20: '',
          reflectionLength: 0,
          firstSubmittedAt: '',
          latestSubmittedAt: '',
          inputNumberMismatch: false,
          submittedNumber: null
        };
      }

      const first = subs[0];
      const latest = subs[subs.length - 1];
      const reflection20 = String(latest.reflection20 || '');
      const subNum = Number(latest.number) || entry.number;

      return {
        classNo: entry.classNo,
        number: entry.number,
        studentCode: entry.studentCode,
        name: entry.name,
        isExtra: entry.isExtra,
        submitted: true,
        attempts: subs.length,
        score: Number(first.score) || 0,
        total: Number(first.total) || 19,
        accuracy: Number(first.accuracy) || 0,
        wrongItems: String(first.wrongItems || ''),
        activityThink: String(latest.activityThink || ''),
        selectedPick: String(latest.selectedPick || ''),
        reflectionReason: String(latest.reflectionReason || ''),
        reflection20: reflection20,
        reflectionLength: reflection20.trim().length,
        firstSubmittedAt: String(first.submittedAt || ''),
        latestSubmittedAt: String(latest.submittedAt || ''),
        inputNumberMismatch: !entry.isExtra && subNum !== entry.number,
        submittedNumber: subNum
      };
    });
  }

  function sortStudents(students, sortMode) {
    const mode = sortMode || 'accuracy';
    return (students || []).slice().sort(function (a, b) {
      if (mode === 'number') {
        if (a.classNo !== b.classNo) return a.classNo - b.classNo;
        if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1;
        if (a.number !== b.number) return a.number - b.number;
        return a.name.localeCompare(b.name, 'ko');
      }

      // All other modes place submitted students first, unsubmitted students at bottom by number
      if (a.submitted !== b.submitted) return a.submitted ? -1 : 1;
      if (!a.submitted && !b.submitted) {
        if (a.classNo !== b.classNo) return a.classNo - b.classNo;
        return a.number - b.number;
      }

      if (mode === 'reflection') {
        if (b.reflectionLength !== a.reflectionLength) return b.reflectionLength - a.reflectionLength;
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return a.number - b.number;
      }
      if (mode === 'time') {
        const cmp = String(a.firstSubmittedAt || '').localeCompare(String(b.firstSubmittedAt || ''));
        if (cmp !== 0) return cmp;
        return a.number - b.number;
      }

      // Default: accuracy desc -> reflectionLength desc -> firstSubmittedAt asc -> number asc
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      if (b.reflectionLength !== a.reflectionLength) return b.reflectionLength - a.reflectionLength;
      const cmp = String(a.firstSubmittedAt || '').localeCompare(String(b.firstSubmittedAt || ''));
      if (cmp !== 0) return cmp;
      return a.number - b.number;
    });
  }

  function cryptoRandomInt(maxExclusive) {
    if (typeof root !== 'undefined' && root.crypto && typeof root.crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      let r = 0;
      do {
        root.crypto.getRandomValues(buf);
        r = buf[0];
      } while (r >= limit);
      return r % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffleArray(items) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = cryptoRandomInt(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function runConditionalDraw(students, existingSelectedMap, options) {
    const opts = options || {};
    const minAccuracy = Number(opts.minAccuracy) || 0;
    const minReflectionLen = Number(opts.minReflectionLen) || 0;
    const targetCount = Math.max(1, Number(opts.targetCount) || 10);
    const keepExisting = opts.keepExisting !== false;

    const nextMap = {};
    if (keepExisting && existingSelectedMap) {
      Object.keys(existingSelectedMap).forEach(function (code) {
        nextMap[code] = Object.assign({}, existingSelectedMap[code]);
      });
    }

    const currentCount = Object.keys(nextMap).length;
    const needed = keepExisting ? Math.max(0, targetCount - currentCount) : targetCount;

    const candidates = (students || []).filter(function (s) {
      if (!s.submitted) return false;
      if (keepExisting && nextMap[s.studentCode]) return false;
      return Number(s.accuracy) >= minAccuracy && s.reflectionLength >= minReflectionLen;
    });

    if (needed === 0) {
      return {
        selectedMap: nextMap,
        drawnCodes: [],
        candidateCount: candidates.length,
        needed: 0
      };
    }

    const shuffled = shuffleArray(candidates);
    const picked = shuffled.slice(0, needed);
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const drawnCodes = [];

    picked.forEach(function (s) {
      nextMap[s.studentCode] = {
        classNo: s.classNo,
        studentCode: s.studentCode,
        name: s.name,
        accuracy: s.accuracy,
        method: '조건부추첨',
        selectedAt: nowStr,
        note: '기준: 정답률 ' + minAccuracy + '% 이상, 소감 ' + minReflectionLen + '자 이상'
      };
      drawnCodes.push(s.studentCode);
    });

    return {
      selectedMap: nextMap,
      drawnCodes: drawnCodes,
      candidateCount: candidates.length,
      needed: needed
    };
  }

  function generateReflectionHtml(title, students, selectionsMap) {
    const rowsHtml = (students || []).map(function (s) {
      const sel = selectionsMap && selectionsMap[s.studentCode];
      const selBadge = sel
        ? '<span class="sel-badge">선정 (' + escapeHtml(sel.method || '직접선정') + ')</span>'
        : '-';
      const statusTxt = s.submitted ? s.accuracy + '%' : '<span style="color:#8c7768;">미제출</span>';
      return (
        '<tr>' +
          '<td class="num">' + escapeHtml(s.classNo + '반 ' + s.number + '번') + '</td>' +
          '<td class="name">' + escapeHtml(s.name) + '</td>' +
          '<td class="acc">' + statusTxt + '</td>' +
          '<td class="sel">' + selBadge + '</td>' +
          '<td class="pick">' + escapeHtml(s.selectedPick || '-') + '</td>' +
          '<td class="body">' +
            (s.submitted
              ? (s.activityThink ? '<div class="sub-item"><strong>[활동 1]</strong> ' + escapeHtml(s.activityThink) + '</div>' : '') +
                (s.reflectionReason ? '<div class="sub-item"><strong>[인상 깊은 이유]</strong> ' + escapeHtml(s.reflectionReason) + '</div>' : '') +
                '<div class="sub-item"><strong>[20번 감사 편지·다짐]</strong> ' + escapeHtml(s.reflection20 || '-') + '</div>'
              : '<span style="color:#8c7768;">미제출</span>') +
          '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8" />\n' +
      '<title>' + escapeHtml(title) + '</title>\n' +
      '<style>\n' +
      'body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;background:#f2ebe0;color:#2a211d;margin:24px;line-height:1.58;}\n' +
      '.doc-sheet{max-width:960px;margin:0 auto;background:#faf7f1;border:1px solid #bfa992;border-top:5px solid #64261e;padding:24px;}\n' +
      'h1{font-family:"Noto Serif KR","Batang",serif;font-size:21px;color:#64261e;margin:0 0 6px;} .meta{color:#6e5d53;font-size:13px;margin-bottom:16px;}\n' +
      '.print-btn{padding:8px 14px;background:#64261e;color:#fff;border:none;border-radius:2px;font-weight:700;cursor:pointer;margin-bottom:14px;}\n' +
      'table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-top:2px solid #64261e;}\n' +
      'th,td{border:1px solid #d7c8b6;padding:8px 10px;vertical-align:top;text-align:left;}\n' +
      'th{background:#efe7d8;color:#64261e;font-weight:700;}\n' +
      '.num,.acc,.sel{white-space:nowrap;} .name{white-space:nowrap;font-weight:700;}\n' +
      '.sub-item{margin-bottom:4px;} .sub-item:last-child{margin-bottom:0;}\n' +
      '.sel-badge{display:inline-block;background:#f7ecce;color:#8c5a1e;border:1px solid #d6b67d;padding:2px 6px;border-radius:2px;font-weight:700;font-size:12px;}\n' +
      '@media print {.print-btn{display:none;} body{background:#fff;margin:8mm;} .doc-sheet{border:none;background:#fff;padding:0;}}\n' +
      '</style>\n</head>\n<body>\n<div class="doc-sheet">\n' +
      '<button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>\n' +
      '<h1>' + escapeHtml(title) + '</h1>\n' +
      '<div class="meta">총 ' + students.length + '명 · 출력 일시: ' + escapeHtml(new Date().toLocaleString('ko-KR')) + '</div>\n' +
      '<table><thead><tr><th>학반·번호</th><th>이름</th><th>정답률</th><th>선정</th><th>선택 공간/인물</th><th>생각·소감 및 다짐</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table>\n</div>\n</body>\n</html>'
    );
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      normalizeName: normalizeName,
      escapeCsvCell: escapeCsvCell,
      generateCsv: generateCsv,
      generateReflectionHtml: generateReflectionHtml,
      decryptRoster: decryptRoster,
      mergeRosterWithSubmissions: mergeRosterWithSubmissions,
      sortStudents: sortStudents,
      runConditionalDraw: runConditionalDraw
    };
  }

  if (typeof document === 'undefined') return;

  const CONFIG = root.SEODAEMUN_CONFIG || {
    apiUrl: '',
    classes: [1, 2, 3, 4, 5, 6, 7],
    giftTarget: 10
  };

  const urlParams = new URLSearchParams(root.location.search);
  const initialClassParam = Number(urlParams.get('class'));

  const state = {
    authenticated: false,
    demoMode: false,
    pin: '',
    activeTab: initialClassParam >= 1 && initialClassParam <= 7 ? String(initialClassParam) : 'overview',
    statusFilter: 'all',
    sortMode: 'accuracy',
    searchQuery: '',
    viewMode: 'table',
    targetCount: CONFIG.giftTarget || 10,
    drawPanelOpen: false,
    drawMinAccuracy: 80,
    drawMinReflectionLen: 10,
    drawKeepExisting: true,
    justDrawnCodes: [],
    roster: [],
    submissions: [],
    selectionsByClass: {},
    dirtyClasses: {}
  };

  const els = {
    loginView: document.getElementById('loginView'),
    dashView: document.getElementById('dashView'),
    pinInput: document.getElementById('pinInput'),
    loginBtn: document.getElementById('loginBtn'),
    loginError: document.getElementById('loginError'),
    modeBanner: document.getElementById('modeBanner'),
    modeBannerText: document.getElementById('modeBannerText'),
    modeBannerExtra: document.getElementById('modeBannerExtra'),
    classTabs: document.getElementById('classTabs'),
    tabContent: document.getElementById('tabContent'),
    copyClassLinkBtn: document.getElementById('copyClassLinkBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    toast: document.getElementById('toast')
  };

  let toastTimer = null;
  function showToast(msg, isError) {
    els.toast.textContent = msg;
    els.toast.className = 'toast' + (isError ? ' error' : '');
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.hidden = true;
    }, 3400);
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function organizeSelections(selectionsArr) {
    const map = {};
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) { map[c] = {}; });
    (selectionsArr || []).forEach(function (item) {
      const c = Number(item.classNo);
      if (!map[c]) map[c] = {};
      map[c][String(item.studentCode)] = Object.assign({}, item);
    });
    return map;
  }

  function loadLocalPreviewSubmissions() {
    let localSubs = [];
    try {
      const raw = root.localStorage.getItem(DEMO_SUBMISSIONS_KEY);
      if (raw) localSubs = JSON.parse(raw);
    } catch (e) {
      localSubs = [];
    }
    let savedSel = null;
    try {
      const rawSel = root.localStorage.getItem(DEMO_SELECTIONS_KEY);
      if (rawSel) savedSel = JSON.parse(rawSel);
    } catch (e) {
      savedSel = null;
    }

    state.submissions = Array.isArray(localSubs) ? localSubs : [];
    state.selectionsByClass = organizeSelections([]);
    if (savedSel && typeof savedSel === 'object') {
      Object.keys(savedSel).forEach(function (c) {
        state.selectionsByClass[Number(c)] = savedSel[c];
      });
    }
    state.dirtyClasses = {};
  }

  async function fetchLiveDashboard(pin) {
    const url = CONFIG.apiUrl + (CONFIG.apiUrl.indexOf('?') === -1 ? '?' : '&') +
      'action=dashboard&pin=' + encodeURIComponent(pin);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json || json.ok === false) {
      throw new Error((json && json.error) || 'FETCH_FAILED');
    }
    state.submissions = json.submissions || [];
    state.selectionsByClass = organizeSelections(json.selections || []);
    if (Array.isArray(json.roster) && json.roster.length > 0) {
      state.roster = json.roster;
    }
    state.dirtyClasses = {};
  }

  async function saveClassSelection(classNo) {
    const classMap = state.selectionsByClass[classNo] || {};
    const winners = Object.keys(classMap).map(function (code) { return classMap[code]; });

    if (state.demoMode || !CONFIG.apiUrl) {
      try {
        root.localStorage.setItem(DEMO_SELECTIONS_KEY, JSON.stringify(state.selectionsByClass));
      } catch (e) {}
      state.dirtyClasses[classNo] = false;
      renderAll();
      showToast(classNo + '반 선정 명단(' + winners.length + '명)이 이 브라우저에 저장되었습니다.');
      return;
    }

    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveSelection',
          pin: state.pin,
          classNo: classNo,
          winners: winners
        }),
        redirect: 'follow'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json || json.ok === false) {
        throw new Error((json && json.error) || 'SAVE_FAILED');
      }
      state.dirtyClasses[classNo] = false;
      renderAll();
      showToast(classNo + '반 선정 결과(' + winners.length + '명)가 구글 시트에 저장되었습니다.');
    } catch (err) {
      showToast('저장에 실패했습니다: ' + err.message, true);
    }
  }

  async function deleteStudentSubmission(student) {
    const msg =
      '1학년 ' + student.classNo + '반 ' + student.number + '번 ' + student.name +
      ' 학생의 제출 기록(' + student.attempts + '건)을 삭제할까요?\n' +
      '삭제하면 미제출 상태로 돌아가고 문화상품권 선정 명단에서도 함께 제외됩니다.';
    if (!root.confirm(msg)) return;

    if (state.demoMode || !CONFIG.apiUrl) {
      try {
        const raw = root.localStorage.getItem(DEMO_SUBMISSIONS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const normTarget = normalizeName(student.name);
        const filtered = arr.filter(function (sub) {
          if (Number(sub.classNo) !== Number(student.classNo)) return true;
          const codeMatch = String(sub.studentCode || '') === String(student.studentCode);
          const nameMatch = normalizeName(sub.name) === normTarget;
          return !(codeMatch || nameMatch);
        });
        root.localStorage.setItem(DEMO_SUBMISSIONS_KEY, JSON.stringify(filtered));
      } catch (e) {}

      if (state.selectionsByClass[student.classNo]) {
        delete state.selectionsByClass[student.classNo][student.studentCode];
      }
      try {
        root.localStorage.setItem(DEMO_SELECTIONS_KEY, JSON.stringify(state.selectionsByClass));
      } catch (e) {}

      loadLocalPreviewSubmissions();
      renderAll();
      showToast(student.name + ' 학생의 제출 기록을 삭제했습니다.');
      return;
    }

    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteSubmission',
          pin: state.pin,
          classNo: student.classNo,
          studentCode: student.studentCode,
          name: student.name
        }),
        redirect: 'follow'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json || json.ok === false) {
        throw new Error((json && json.error) || 'DELETE_FAILED');
      }
      await fetchLiveDashboard(state.pin);
      renderAll();
      showToast(student.name + ' 학생의 구글 시트 제출 기록을 삭제했습니다.');
    } catch (err) {
      showToast('삭제에 실패했습니다: ' + err.message, true);
    }
  }

  function getMergedAllStudents() {
    return mergeRosterWithSubmissions(state.roster, state.submissions);
  }

  function getClassStudents(classNo) {
    const classRoster = state.roster.filter(function (r) { return Number(r.classNo) === Number(classNo); });
    const classSubs = state.submissions.filter(function (s) { return Number(s.classNo) === Number(classNo); });
    return mergeRosterWithSubmissions(classRoster, classSubs);
  }

  function applyClassFilters(students) {
    let list = students;
    if (state.statusFilter === 'submitted') {
      list = list.filter(function (s) { return s.submitted; });
    } else if (state.statusFilter === 'unsubmitted') {
      list = list.filter(function (s) { return !s.submitted; });
    }

    const q = String(state.searchQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function (s) {
      return (
        s.name.toLowerCase().indexOf(q) !== -1 ||
        String(s.number).indexOf(q) !== -1 ||
        s.selectedPick.toLowerCase().indexOf(q) !== -1 ||
        s.reflection20.toLowerCase().indexOf(q) !== -1 ||
        s.activityThink.toLowerCase().indexOf(q) !== -1 ||
        s.reflectionReason.toLowerCase().indexOf(q) !== -1
      );
    });
  }

  const REFLECTION_CSV_HEADERS = [
    '반',
    '번호',
    '학번',
    '이름',
    '제출여부',
    '점수',
    '정답률(%)',
    '선정여부',
    '선정방식',
    '활동1_생각해보기',
    '선택공간_인물',
    '나만의기록_이유',
    '20번_소감다짐',
    '소감글자수',
    '최초제출시각'
  ];

  function buildCsvRowsForStudents(students, selectionsMapGlobal) {
    return students.map(function (s) {
      const selMap = selectionsMapGlobal[s.classNo] || {};
      const sel = selMap[s.studentCode];
      return [
        s.classNo + '반',
        s.number,
        s.studentCode,
        s.name + (s.isExtra ? ' (명단외)' : ''),
        s.submitted ? '제출완료' : '미제출',
        s.submitted ? (s.score + '/' + s.total) : '',
        s.submitted ? s.accuracy : '',
        sel ? '선정' : '',
        sel ? sel.method : '',
        s.activityThink,
        s.selectedPick,
        s.reflectionReason,
        s.reflection20,
        s.reflectionLength,
        s.firstSubmittedAt
      ];
    });
  }

  function exportClassReflectionsCsv(classNo) {
    const students = sortStudents(getClassStudents(classNo), 'number');
    const csv = generateCsv(REFLECTION_CSV_HEADERS, buildCsvRowsForStudents(students, state.selectionsByClass));
    downloadTextFile('서대문형무소_1학년' + classNo + '반_소감문.csv', csv, 'text/csv;charset=utf-8');
  }

  function exportClassReflectionsHtml(classNo) {
    const students = sortStudents(getClassStudents(classNo), 'number');
    const html = generateReflectionHtml(
      '서대문형무소역사관 현장체험학습 소감문 모음 (1학년 ' + classNo + '반)',
      students,
      state.selectionsByClass[classNo] || {}
    );
    downloadTextFile('서대문형무소_1학년' + classNo + '반_소감문_인쇄용.html', html, 'text/html;charset=utf-8');
  }

  function exportClassWinnersCsv(classNo) {
    const students = sortStudents(getClassStudents(classNo), 'accuracy');
    const classSel = state.selectionsByClass[classNo] || {};
    const winners = students.filter(function (s) { return s.submitted && Boolean(classSel[s.studentCode]); });
    const headers = ['반', '번호', '학번', '이름', '정답률(%)', '선정방식', '소감글자수', '20번_소감다짐'];
    const rows = winners.map(function (s) {
      const sel = classSel[s.studentCode];
      return [s.classNo + '반', s.number, s.studentCode, s.name, s.accuracy, sel.method, s.reflectionLength, s.reflection20];
    });
    downloadTextFile('서대문형무소_1학년' + classNo + '반_문화상품권선정_' + winners.length + '명.csv', generateCsv(headers, rows), 'text/csv;charset=utf-8');
  }

  function exportAllWinnersCsv() {
    const headers = ['반', '번호', '학번', '이름', '정답률(%)', '선정방식', '선정시각', '20번_소감다짐'];
    const rows = [];
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) {
      const students = sortStudents(getClassStudents(c), 'number');
      const classSel = state.selectionsByClass[c] || {};
      students.forEach(function (s) {
        const sel = classSel[s.studentCode];
        if (sel && s.submitted) {
          rows.push([c + '반', s.number, s.studentCode, s.name, s.accuracy, sel.method, sel.selectedAt || '', s.reflection20]);
        }
      });
    });
    downloadTextFile('서대문형무소_1~7반_문화상품권선정명단_' + rows.length + '명.csv', generateCsv(headers, rows), 'text/csv;charset=utf-8');
  }

  function exportAllReflectionsCsv() {
    let allStudents = [];
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) {
      allStudents = allStudents.concat(sortStudents(getClassStudents(c), 'number'));
    });
    const csv = generateCsv(REFLECTION_CSV_HEADERS, buildCsvRowsForStudents(allStudents, state.selectionsByClass));
    downloadTextFile('서대문형무소_1~7반_전체소감문.csv', csv, 'text/csv;charset=utf-8');
  }

  function exportAllReflectionsHtml() {
    let allStudents = [];
    const mergedSel = {};
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) {
      allStudents = allStudents.concat(sortStudents(getClassStudents(c), 'number'));
      Object.assign(mergedSel, state.selectionsByClass[c] || {});
    });
    const html = generateReflectionHtml('서대문형무소역사관 현장체험학습 1~7반 전체 소감문', allStudents, mergedSel);
    downloadTextFile('서대문형무소_1~7반_전체소감문_인쇄용.html', html, 'text/html;charset=utf-8');
  }

  function renderTabs() {
    const classes = CONFIG.classes || [1, 2, 3, 4, 5, 6, 7];
    const allStudents = getMergedAllStudents();
    const rosterCount = allStudents.filter(function (s) { return !s.isExtra; }).length;
    const submittedRosterCount = allStudents.filter(function (s) { return !s.isExtra && s.submitted; }).length;
    let totalWinners = 0;
    classes.forEach(function (c) {
      totalWinners += Object.keys(state.selectionsByClass[c] || {}).length;
    });

    const parts = [];
    parts.push(
      '<button type="button" class="class-tab' + (state.activeTab === 'overview' ? ' active' : '') + '" data-tab="overview">' +
        '<span>전체 현황 (1~7반)</span>' +
        '<span class="class-tab-meta">제출 ' + submittedRosterCount + '/' + rosterCount + ' · 선정 ' + totalWinners + '/70</span>' +
      '</button>'
    );

    classes.forEach(function (c) {
      const cStudents = getClassStudents(c).filter(function (s) { return !s.isExtra; });
      const subCnt = cStudents.filter(function (s) { return s.submitted; }).length;
      const selCount = Object.keys(state.selectionsByClass[c] || {}).length;
      const dirty = state.dirtyClasses[c] ? ' *' : '';
      parts.push(
        '<button type="button" class="class-tab' + (state.activeTab === String(c) ? ' active' : '') + '" data-tab="' + c + '">' +
          '<span>' + c + '반' + dirty + '</span>' +
          '<span class="class-tab-meta">제출 ' + subCnt + '/' + cStudents.length + ' · 선정 ' + selCount + '/' + state.targetCount + '</span>' +
        '</button>'
      );
    });

    els.classTabs.innerHTML = parts.join('');
    els.classTabs.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeTab = btn.getAttribute('data-tab');
        state.justDrawnCodes = [];
        renderAll();
      });
    });
  }

  function renderOverview() {
    const classes = CONFIG.classes || [1, 2, 3, 4, 5, 6, 7];
    const allStudents = getMergedAllStudents();
    const rosterOnly = allStudents.filter(function (s) { return !s.isExtra; });
    const submittedRoster = rosterOnly.filter(function (s) { return s.submitted; });
    const allSubmitted = allStudents.filter(function (s) { return s.submitted; });
    const avgAll = allSubmitted.length
      ? (Math.round((allSubmitted.reduce(function (s, st) { return s + st.accuracy; }, 0) / allSubmitted.length) * 10) / 10)
      : 0;
    let totalSelected = 0;
    classes.forEach(function (c) {
      totalSelected += Object.keys(state.selectionsByClass[c] || {}).length;
    });

    const cardsHtml = classes.map(function (c) {
      const list = getClassStudents(c);
      const cRoster = list.filter(function (s) { return !s.isExtra; });
      const cSub = cRoster.filter(function (s) { return s.submitted; });
      const unsubCount = cRoster.length - cSub.length;
      const avg = cSub.length
        ? Math.round((cSub.reduce(function (s, st) { return s + st.accuracy; }, 0) / cSub.length) * 10) / 10
        : 0;
      const selCount = Object.keys(state.selectionsByClass[c] || {}).length;
      const done = selCount >= state.targetCount;
      return (
        '<div class="class-summary-card" data-jump-class="' + c + '">' +
          '<div class="class-summary-head">' +
            '<span class="class-summary-name">1학년 ' + c + '반</span>' +
            '<span class="badge ' + (done ? 'badge-ok' : 'badge-warn') + '">' + selCount + ' / ' + state.targetCount + '명 선정</span>' +
          '</div>' +
          '<div style="font-size:14px;">재적 <strong>' + cRoster.length + '명</strong> · 제출 <strong style="color:var(--ok);">' + cSub.length + '명</strong> · 미제출 <strong style="color:var(--bad);">' + unsubCount + '명</strong></div>' +
          '<div style="font-size:14px;">제출자 평균 정답률: <strong>' + (cSub.length ? avg + '%' : '-') + '</strong></div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:6px;">눌러서 ' + c + '반 미제출자·소감·선정 보기 →</div>' +
        '</div>'
      );
    }).join('');

    els.tabContent.innerHTML =
      '<div class="kpi-grid">' +
        '<div class="kpi-card"><div class="kpi-label">1학년 전체 제출 / 미제출</div><div class="kpi-value">' + submittedRoster.length + ' / ' + rosterOnly.length + '명</div><div style="font-size:12.5px;color:var(--muted);margin-top:2px;">미제출 ' + (rosterOnly.length - submittedRoster.length) + '명</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">제출 학생 평균 정답률</div><div class="kpi-value">' + (allSubmitted.length ? avgAll + '%' : '-') + '</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">문화상품권 선정 현황</div><div class="kpi-value">' + totalSelected + ' / ' + (classes.length * state.targetCount) + '명</div></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="toolbar-row">' +
          '<h2 style="margin:0;font-size:18px;color:var(--ink);">전체(1~7반) 통합 다운로드</h2>' +
          '<div class="filter-group">' +
            '<button type="button" class="btn btn-primary" id="dlAllWinnersBtn">전체 선정 명단 CSV (' + totalSelected + '명)</button>' +
            '<button type="button" class="btn btn-navy" id="dlAllRefCsvBtn">1~7반 전체 소감문 CSV</button>' +
            '<button type="button" class="btn btn-outline" id="dlAllRefHtmlBtn">1~7반 전체 소감문 문서(인쇄/HTML)</button>' +
          '</div>' +
        '</div>' +
        '<div class="overview-grid">' + cardsHtml + '</div>' +
      '</div>';

    document.getElementById('dlAllWinnersBtn').addEventListener('click', exportAllWinnersCsv);
    document.getElementById('dlAllRefCsvBtn').addEventListener('click', exportAllReflectionsCsv);
    document.getElementById('dlAllRefHtmlBtn').addEventListener('click', exportAllReflectionsHtml);
    els.tabContent.querySelectorAll('[data-jump-class]').forEach(function (card) {
      card.addEventListener('click', function () {
        state.activeTab = card.getAttribute('data-jump-class');
        renderAll();
      });
    });
  }

  function renderClassView(classNo) {
    const allClassStudents = getClassStudents(classNo);
    const rosterStudents = allClassStudents.filter(function (s) { return !s.isExtra; });
    const submittedCnt = rosterStudents.filter(function (s) { return s.submitted; }).length;
    const unsubmittedList = sortStudents(rosterStudents.filter(function (s) { return !s.submitted; }), 'number');

    const filtered = applyClassFilters(allClassStudents);
    const sorted = sortStudents(filtered, state.sortMode);
    const classSel = state.selectionsByClass[classNo] || {};
    const selectedCount = Object.keys(classSel).length;
    const isDirty = Boolean(state.dirtyClasses[classNo]);

    const allClassStudentsForDraw = sortStudents(allClassStudents, 'accuracy');
    const drawCandidates = allClassStudentsForDraw.filter(function (s) {
      if (!s.submitted) return false;
      if (state.drawKeepExisting && classSel[s.studentCode]) return false;
      return Number(s.accuracy) >= state.drawMinAccuracy && s.reflectionLength >= state.drawMinReflectionLen;
    });
    const neededNow = state.drawKeepExisting
      ? Math.max(0, state.targetCount - selectedCount)
      : state.targetCount;

    const presetsHtml = [0, 70, 80, 90, 100].map(function (val) {
      return '<button type="button" class="preset-btn' + (state.drawMinAccuracy === val ? ' active' : '') + '" data-min-acc="' + val + '">' + (val === 0 ? '제한없음' : val + '% 이상') + '</button>';
    }).join('');

    let bodyHtml = '';
    if (sorted.length === 0) {
      bodyHtml = '<p style="text-align:center;padding:36px 12px;color:var(--muted);">조건에 맞는 학생이 없습니다.</p>';
    } else if (state.viewMode === 'table') {
      const rows = sorted.map(function (s) {
        const sel = classSel[s.studentCode];
        const justDrawn = state.justDrawnCodes.indexOf(s.studentCode) !== -1;
        const rowClass = [
          sel && s.submitted ? 'selected-row' : '',
          !s.submitted ? 'unsubmitted-row' : '',
          justDrawn ? 'just-drawn' : ''
        ].filter(Boolean).join(' ');

        const badges = [];
        if (!s.submitted) {
          badges.push('<span class="badge badge-unsubmitted">미제출</span>');
        } else {
          badges.push('<span class="score-pill' + (s.accuracy >= 85 ? ' high' : '') + '">' + s.accuracy + '%</span>');
          if (s.attempts > 1) {
            badges.push('<span class="badge badge-navy">' + s.attempts + '차 제출</span>');
          }
        }
        if (s.isExtra) {
          badges.push('<span class="badge badge-extra">명단 외</span>');
        }

        return (
          '<tr class="' + rowClass + '">' +
            '<td><input type="checkbox" class="select-chk" data-toggle-sel="' + escapeHtml(s.studentCode) + '" ' + (sel && s.submitted ? 'checked' : '') + (!s.submitted ? ' disabled' : '') + ' aria-label="' + escapeHtml(s.name) + ' 선정" /></td>' +
            '<td><strong>' + s.number + '번</strong>' + (s.inputNumberMismatch ? '<div class="mismatch-note">입력: ' + s.submittedNumber + '번</div>' : '') + '</td>' +
            '<td><strong>' + escapeHtml(s.name) + '</strong><div style="font-size:11.5px;color:var(--muted);">' + escapeHtml(s.studentCode) + '</div></td>' +
            '<td><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">' + badges.join('') + '</div></td>' +
            '<td>' + (sel && s.submitted ? '<span class="badge badge-gold">' + escapeHtml(sel.method || '직접선정') + '</span>' : '-') + '</td>' +
            '<td>' +
              (s.submitted
                ? '<div class="reflection-preview">' + escapeHtml(s.reflection20 || '(미작성)') + '</div>' +
                  '<div class="reflection-meta">선택: ' + escapeHtml(s.selectedPick || '-') + ' · 소감 ' + s.reflectionLength + '자</div>'
                : '<span style="font-size:13px;color:var(--muted);">아직 제출하지 않았습니다</span>') +
            '</td>' +
            '<td style="white-space:nowrap;font-size:12.5px;color:var(--muted);">' + (s.submitted ? escapeHtml((s.firstSubmittedAt || '').slice(5, 16)) : '-') + '</td>' +
            '<td style="white-space:nowrap;">' +
              (s.submitted
                ? '<button type="button" class="btn-danger-sm" data-delete-sub="' + escapeHtml(s.studentCode) + '">제출 삭제</button>'
                : '-') +
            '</td>' +
          '</tr>'
        );
      }).join('');

      bodyHtml =
        '<div class="table-wrap">' +
          '<table class="data-table">' +
            '<thead><tr><th>선정</th><th>번호</th><th>이름</th><th>제출·정답률</th><th>방식</th><th>20번 소감·다짐 / 선택 공간</th><th>제출시각</th><th>관리</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>';
    } else {
      const cards = sorted.map(function (s) {
        const sel = classSel[s.studentCode];
        const justDrawn = state.justDrawnCodes.indexOf(s.studentCode) !== -1;
        const cardClass = [
          'reflection-card',
          sel && s.submitted ? 'selected-row' : '',
          !s.submitted ? 'unsubmitted-row' : '',
          justDrawn ? 'just-drawn' : ''
        ].filter(Boolean).join(' ');

        return (
          '<article class="' + cardClass + '">' +
            '<div class="reflection-card-head">' +
              '<div>' +
                '<div style="font-size:17px;font-weight:800;color:var(--ink);">' + s.number + '번 ' + escapeHtml(s.name) + (s.isExtra ? ' <span class="badge badge-extra">명단 외</span>' : '') + '</div>' +
                (s.submitted
                  ? '<div style="font-size:12.5px;color:var(--muted);">정답률 <strong style="color:var(--brick);">' + s.accuracy + '%</strong> · 소감 ' + s.reflectionLength + '자' + (s.attempts > 1 ? ' · ' + s.attempts + '차' : '') + '</div>'
                  : '<div style="font-size:12.5px;color:var(--muted);">미제출 학생</div>') +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                (s.submitted
                  ? '<label style="display:inline-flex;align-items:center;gap:5px;font-weight:800;cursor:pointer;">' +
                      '<input type="checkbox" class="select-chk" data-toggle-sel="' + escapeHtml(s.studentCode) + '" ' + (sel ? 'checked' : '') + ' />' +
                      '<span>' + (sel ? '선정됨' : '선정') + '</span>' +
                    '</label>' +
                    '<button type="button" class="btn-danger-sm" data-delete-sub="' + escapeHtml(s.studentCode) + '">제출 삭제</button>'
                  : '<span class="badge badge-unsubmitted">미제출</span>') +
              '</div>' +
            '</div>' +
            (s.submitted
              ? (s.selectedPick ? '<div class="reflection-block"><div class="reflection-block-label">선택한 공간 / 인물</div>' + escapeHtml(s.selectedPick) + '</div>' : '') +
                (s.activityThink ? '<div class="reflection-block"><div class="reflection-block-label">활동 1 (부채꼴 설계 이유)</div>' + escapeHtml(s.activityThink) + '</div>' : '') +
                (s.reflectionReason ? '<div class="reflection-block"><div class="reflection-block-label">마음에 남은 이유와 다짐</div>' + escapeHtml(s.reflectionReason) + '</div>' : '') +
                '<div class="reflection-block"><div class="reflection-block-label">20번 감사 편지 · 다짐</div>' + escapeHtml(s.reflection20 || '(미작성)') + '</div>'
              : '<div class="reflection-block">아직 활동지를 제출하지 않았습니다.</div>') +
          '</article>'
        );
      }).join('');
      bodyHtml = '<div class="reflection-cards">' + cards + '</div>';
    }

    els.tabContent.innerHTML =
      '<div class="card">' +
        '<div class="toolbar-row">' +
          '<div class="filter-group">' +
            '<h2 style="margin:0;font-size:20px;color:var(--ink);">1학년 ' + classNo + '반 · 재적 ' + rosterStudents.length + '명 <span style="font-size:14.5px;color:var(--muted);">(제출 ' + submittedCnt + '명 · 미제출 ' + unsubmittedList.length + '명)</span></h2>' +
            '<select id="statusFilterSel" class="select-sm" aria-label="제출 상태 필터">' +
              '<option value="all"' + (state.statusFilter === 'all' ? ' selected' : '') + '>전체 명단 (제출+미제출)</option>' +
              '<option value="submitted"' + (state.statusFilter === 'submitted' ? ' selected' : '') + '>제출 완료만 (' + submittedCnt + '명)</option>' +
              '<option value="unsubmitted"' + (state.statusFilter === 'unsubmitted' ? ' selected' : '') + '>미제출자만 보기 (' + unsubmittedList.length + '명)</option>' +
            '</select>' +
            '<select id="sortModeSel" class="select-sm" aria-label="정렬 기준">' +
              '<option value="accuracy"' + (state.sortMode === 'accuracy' ? ' selected' : '') + '>정답률 높은 순</option>' +
              '<option value="number"' + (state.sortMode === 'number' ? ' selected' : '') + '>번호 순 (출석부)</option>' +
              '<option value="reflection"' + (state.sortMode === 'reflection' ? ' selected' : '') + '>소감 긴 순</option>' +
              '<option value="time"' + (state.sortMode === 'time' ? ' selected' : '') + '>제출 시각 순</option>' +
            '</select>' +
            '<input id="searchInput" class="search-sm" type="search" placeholder="이름·번호·소감 검색…" value="' + escapeHtml(state.searchQuery) + '" />' +
          '</div>' +
          '<div class="view-toggle" role="group" aria-label="보기 전환">' +
            '<button type="button" class="' + (state.viewMode === 'table' ? 'active' : '') + '" data-view="table">표 보기</button>' +
            '<button type="button" class="' + (state.viewMode === 'cards' ? 'active' : '') + '" data-view="cards">소감문 모아보기</button>' +
          '</div>' +
        '</div>' +

        '<!-- 반별 소감문 다운로드 + 미제출자 복사 + 선정 저장 바 -->' +
        '<div class="action-bar">' +
          '<div class="selection-status">' +
            '<span class="selection-count">' + classNo + '반 문화상품권 선정: <strong>' + selectedCount + '</strong> / ' + state.targetCount + '명</span>' +
            (isDirty ? '<span class="unsaved-pill">저장 안 된 변경 있음</span>' : '') +
            '<button type="button" class="btn btn-outline" id="toggleDrawPanelBtn">' + (state.drawPanelOpen ? '추첨 창 닫기 ▲' : '조건부 / 동점자 추첨 ▼') + '</button>' +
            '<button type="button" class="btn btn-ok" id="saveSelBtn">' + classNo + '반 선정 결과 저장</button>' +
          '</div>' +
          '<div class="filter-group">' +
            '<button type="button" class="btn btn-outline" id="copyUnsubBtn">미제출자 명단 복사 (' + unsubmittedList.length + '명)</button>' +
            '<button type="button" class="btn btn-navy" id="dlClassRefCsvBtn">' + classNo + '반 소감문 CSV</button>' +
            '<button type="button" class="btn btn-outline" id="dlClassRefHtmlBtn">' + classNo + '반 소감문 문서(인쇄/HTML)</button>' +
            '<button type="button" class="btn btn-outline" id="dlClassWinCsvBtn">' + classNo + '반 선정 명단 CSV</button>' +
          '</div>' +
        '</div>' +

        '<!-- 조건부 / 동점자 추첨 패널 -->' +
        '<div class="draw-panel" id="drawPanel"' + (state.drawPanelOpen ? '' : ' hidden') + '>' +
          '<strong>조건부 / 동점자 랜덤 추첨 (' + classNo + '반)</strong>' +
          '<p style="margin:4px 0 8px;font-size:13px;color:#54320c;">제출 완료한 학생 가운데 최소 정답률과 최소 소감 글자 수 조건을 충족하는 학생을 공정하게 랜덤 추첨합니다. (미제출자는 자동 제외)</p>' +
          '<div class="draw-grid">' +
            '<div>' +
              '<label style="font-size:13px;font-weight:700;">최소 정답률 (%)</label>' +
              '<input type="number" id="drawMinAccInput" class="input-control" min="0" max="100" value="' + state.drawMinAccuracy + '" />' +
              '<div class="preset-row">' + presetsHtml + '</div>' +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:700;">최소 소감 글자 수 (20번)</label>' +
              '<input type="number" id="drawMinLenInput" class="input-control" min="0" max="500" value="' + state.drawMinReflectionLen + '" />' +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:700;">목표 선정 인원</label>' +
              '<input type="number" id="drawTargetInput" class="input-control" min="1" max="35" value="' + state.targetCount + '" />' +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:700;">추첨 방식</label>' +
              '<div style="display:flex;flex-direction:column;gap:4px;font-size:13px;margin-top:4px;">' +
                '<label><input type="radio" name="drawMode" value="keep"' + (state.drawKeepExisting ? ' checked' : '') + ' /> 직접 체크한 학생 유지 + 남은 자리만 추첨</label>' +
                '<label><input type="radio" name="drawMode" value="reset"' + (!state.drawKeepExisting ? ' checked' : '') + ' /> 기존 체크 초기화 후 ' + state.targetCount + '명 새로 추첨</label>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="draw-footer">' +
            '<span style="font-size:13.5px;font-weight:700;color:#54320c;">현재 조건 충족 후보: <strong>' + drawCandidates.length + '명</strong> · 이번 추첨 예정: <strong>' + Math.min(neededNow, drawCandidates.length) + '명</strong></span>' +
            '<div class="filter-group">' +
              '<button type="button" class="btn btn-outline" id="clearSelBtn">이 반 체크 전체 해제</button>' +
              '<button type="button" class="btn btn-primary" id="runDrawBtn">공정 랜덤 추첨 실행</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        bodyHtml +
      '</div>';

    // Bind events
    document.getElementById('statusFilterSel').addEventListener('change', function (e) {
      state.statusFilter = e.target.value;
      renderAll();
    });
    document.getElementById('sortModeSel').addEventListener('change', function (e) {
      state.sortMode = e.target.value;
      renderAll();
    });
    const searchEl = document.getElementById('searchInput');
    searchEl.addEventListener('input', function (e) {
      state.searchQuery = e.target.value;
      renderClassView(classNo);
      const nextSearch = document.getElementById('searchInput');
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    });

    els.tabContent.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.viewMode = btn.getAttribute('data-view');
        renderClassView(classNo);
      });
    });

    document.getElementById('toggleDrawPanelBtn').addEventListener('click', function () {
      state.drawPanelOpen = !state.drawPanelOpen;
      renderClassView(classNo);
    });
    document.getElementById('saveSelBtn').addEventListener('click', function () {
      saveClassSelection(classNo);
    });
    document.getElementById('copyUnsubBtn').addEventListener('click', function () {
      if (unsubmittedList.length === 0) {
        showToast(classNo + '반은 전원 제출을 완료했습니다!');
        return;
      }
      const namesText = unsubmittedList.map(function (s) { return s.number + '번 ' + s.name; }).join(', ');
      const text = '1학년 ' + classNo + '반 미제출자 (' + unsubmittedList.length + '명): ' + namesText;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast(classNo + '반 미제출자 ' + unsubmittedList.length + '명 명단을 복사했습니다.');
        }).catch(function () {
          showToast(text);
        });
      } else {
        showToast(text);
      }
    });
    document.getElementById('dlClassRefCsvBtn').addEventListener('click', function () {
      exportClassReflectionsCsv(classNo);
    });
    document.getElementById('dlClassRefHtmlBtn').addEventListener('click', function () {
      exportClassReflectionsHtml(classNo);
    });
    document.getElementById('dlClassWinCsvBtn').addEventListener('click', function () {
      exportClassWinnersCsv(classNo);
    });

    // Selection checkboxes
    els.tabContent.querySelectorAll('[data-toggle-sel]').forEach(function (chk) {
      chk.addEventListener('change', function () {
        const code = chk.getAttribute('data-toggle-sel');
        const st = allClassStudentsForDraw.find(function (item) { return item.studentCode === code; });
        if (!state.selectionsByClass[classNo]) state.selectionsByClass[classNo] = {};
        if (chk.checked && st && st.submitted) {
          state.selectionsByClass[classNo][code] = {
            classNo: classNo,
            studentCode: st.studentCode,
            name: st.name,
            accuracy: st.accuracy,
            method: '직접선정',
            selectedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
            note: ''
          };
        } else {
          delete state.selectionsByClass[classNo][code];
        }
        state.dirtyClasses[classNo] = true;
        renderAll();
      });
    });

    // Delete submission buttons
    els.tabContent.querySelectorAll('[data-delete-sub]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const code = btn.getAttribute('data-delete-sub');
        const st = allClassStudents.find(function (item) { return item.studentCode === code && item.submitted; });
        if (st) deleteStudentSubmission(st);
      });
    });

    // Draw panel controls
    const minAccEl = document.getElementById('drawMinAccInput');
    const minLenEl = document.getElementById('drawMinLenInput');
    const targetEl = document.getElementById('drawTargetInput');
    if (minAccEl) {
      minAccEl.addEventListener('change', function () {
        state.drawMinAccuracy = Math.max(0, Math.min(100, Number(minAccEl.value) || 0));
        renderClassView(classNo);
      });
    }
    if (minLenEl) {
      minLenEl.addEventListener('change', function () {
        state.drawMinReflectionLen = Math.max(0, Number(minLenEl.value) || 0);
        renderClassView(classNo);
      });
    }
    if (targetEl) {
      targetEl.addEventListener('change', function () {
        state.targetCount = Math.max(1, Math.min(35, Number(targetEl.value) || 10));
        renderAll();
      });
    }
    els.tabContent.querySelectorAll('[data-min-acc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.drawMinAccuracy = Number(btn.getAttribute('data-min-acc'));
        renderClassView(classNo);
      });
    });
    els.tabContent.querySelectorAll('input[name="drawMode"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        state.drawKeepExisting = radio.value === 'keep';
        renderClassView(classNo);
      });
    });

    document.getElementById('clearSelBtn').addEventListener('click', function () {
      state.selectionsByClass[classNo] = {};
      state.justDrawnCodes = [];
      state.dirtyClasses[classNo] = true;
      renderAll();
      showToast(classNo + '반 선정 체크를 모두 해제했습니다. 저장 버튼을 누르면 반영됩니다.');
    });

    document.getElementById('runDrawBtn').addEventListener('click', function () {
      const result = runConditionalDraw(allClassStudentsForDraw, state.selectionsByClass[classNo] || {}, {
        minAccuracy: state.drawMinAccuracy,
        minReflectionLen: state.drawMinReflectionLen,
        targetCount: state.targetCount,
        keepExisting: state.drawKeepExisting
      });
      if (result.needed === 0) {
        showToast('이미 목표 인원(' + state.targetCount + '명)이 선정되어 있습니다. 새로 추첨하려면 초기화 옵션을 고르세요.', true);
        return;
      }
      if (result.drawnCodes.length === 0) {
        showToast('설정한 조건을 만족하는 미선정 제출 학생이 없습니다.', true);
        return;
      }
      state.selectionsByClass[classNo] = result.selectedMap;
      state.justDrawnCodes = result.drawnCodes;
      state.dirtyClasses[classNo] = true;
      renderAll();
      showToast('후보 ' + result.candidateCount + '명 중 ' + result.drawnCodes.length + '명을 추첨했습니다! 「' + classNo + '반 선정 결과 저장」을 눌러 확정하세요.');
    });
  }

  function renderBanner() {
    if (state.demoMode || !CONFIG.apiUrl) {
      els.modeBanner.className = 'mode-banner demo';
      els.modeBannerText.innerHTML =
        '<strong>실제 명렬표 로드됨 (로컬 미리보기 모드):</strong> 대소중학교 1학년 138명 실제 명단이 적용되었습니다. 아직 구글 시트 연동 전이므로 이 브라우저에서 제출한 기록만 표시됩니다.';
    } else {
      els.modeBanner.className = 'mode-banner live';
      els.modeBannerText.innerHTML =
        '<strong>구글 시트 실시간 연결됨 (1학년 138명):</strong> 1~7반 선생님들이 함께 제출·미제출 확인, 제출 삭제, 반별 10명 선정을 진행할 수 있습니다.';
    }
    els.modeBannerExtra.textContent = state.activeTab === 'overview'
      ? '전체(1~7반) 보기 중'
      : state.activeTab + '반 집중 보기 중';
  }

  function renderAll() {
    if (!state.authenticated) return;
    els.loginView.hidden = true;
    els.dashView.hidden = false;
    els.copyClassLinkBtn.hidden = false;
    els.refreshBtn.hidden = false;
    els.logoutBtn.hidden = false;

    renderBanner();
    renderTabs();
    if (state.activeTab === 'overview') {
      renderOverview();
    } else {
      renderClassView(Number(state.activeTab));
    }
  }

  async function tryLoginWithPin(pin) {
    els.loginError.hidden = true;
    if (!pin) {
      els.loginError.textContent = '비밀번호를 입력해 주세요.';
      els.loginError.hidden = false;
      return;
    }

    try {
      els.loginBtn.disabled = true;
      els.loginBtn.textContent = '확인 및 명렬표 복호화 중…';

      if (!CONFIG.apiUrl) {
        const roster = await decryptRoster(root.SEODAEMUN_ENCRYPTED_ROSTER, pin);
        state.roster = roster;
        state.authenticated = true;
        state.demoMode = true;
        state.pin = pin;
        loadLocalPreviewSubmissions();
        try { root.sessionStorage.setItem(SESSION_PIN_KEY, pin); } catch (e) {}
        renderAll();
        return;
      }

      await fetchLiveDashboard(pin);
      if (state.roster.length === 0 && root.SEODAEMUN_ENCRYPTED_ROSTER) {
        try {
          state.roster = await decryptRoster(root.SEODAEMUN_ENCRYPTED_ROSTER, pin);
        } catch (decErr) {
          // If teacher changed PIN on server without re-encrypting roster-enc.js, Google Sheet 명렬표 tab handles it
        }
      }
      state.authenticated = true;
      state.demoMode = false;
      state.pin = pin;
      try { root.sessionStorage.setItem(SESSION_PIN_KEY, pin); } catch (e) {}
      renderAll();
    } catch (err) {
      if (err.message === 'CRYPTO_UNAVAILABLE') {
        els.loginError.textContent = '보안 암호화 복호화를 위해 HTTPS 주소(GitHub Pages)에서 열어 주세요.';
      } else if (err.message === 'INVALID_PIN') {
        els.loginError.textContent = '비밀번호가 일치하지 않습니다.';
      } else {
        els.loginError.textContent = '로그인 실패: ' + err.message;
      }
      els.loginError.hidden = false;
    } finally {
      els.loginBtn.disabled = false;
      els.loginBtn.textContent = '비밀번호로 입장하기';
    }
  }

  function init() {
    els.loginBtn.addEventListener('click', function () {
      tryLoginWithPin(els.pinInput.value.trim());
    });
    els.pinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryLoginWithPin(els.pinInput.value.trim());
    });

    els.refreshBtn.addEventListener('click', async function () {
      if (Object.keys(state.dirtyClasses).some(function (k) { return state.dirtyClasses[k]; })) {
        if (!root.confirm('아직 저장하지 않은 선정 체크가 있습니다. 새로고침하시겠습니까?')) return;
      }
      if (state.demoMode || !CONFIG.apiUrl) {
        loadLocalPreviewSubmissions();
        renderAll();
        showToast('로컬 미리보기 데이터를 다시 불러왔습니다.');
      } else {
        try {
          await fetchLiveDashboard(state.pin);
          renderAll();
          showToast('구글 시트 최신 데이터를 불러왔습니다.');
        } catch (err) {
          showToast('새로고침 실패: ' + err.message, true);
        }
      }
    });

    els.copyClassLinkBtn.addEventListener('click', function () {
      const base = root.location.href.split('?')[0];
      const url = state.activeTab === 'overview' ? base : base + '?class=' + state.activeTab;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          showToast((state.activeTab === 'overview' ? '전체 대시보드' : state.activeTab + '반 담임') + ' 링크를 복사했습니다.');
        }).catch(function () {
          showToast('링크: ' + url);
        });
      } else {
        showToast('링크: ' + url);
      }
    });

    els.logoutBtn.addEventListener('click', function () {
      state.authenticated = false;
      state.pin = '';
      state.roster = [];
      try { root.sessionStorage.removeItem(SESSION_PIN_KEY); } catch (e) {}
      els.dashView.hidden = true;
      els.loginView.hidden = false;
      els.copyClassLinkBtn.hidden = true;
      els.refreshBtn.hidden = true;
      els.logoutBtn.hidden = true;
      els.pinInput.value = '';
    });

    try {
      const savedPin = root.sessionStorage.getItem(SESSION_PIN_KEY);
      if (savedPin) {
        tryLoginWithPin(savedPin);
      }
    } catch (e) {}
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
