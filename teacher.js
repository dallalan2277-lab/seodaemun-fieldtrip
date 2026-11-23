'use strict';

(function (root) {
  const SESSION_PIN_KEY = 'seodaemun_teacher_pin';
  const DEMO_SUBMISSIONS_KEY = 'seodaemun_demo_submissions';
  const DEMO_SELECTIONS_KEY = 'seodaemun_demo_selections';
  const DEFAULT_PIN = 'seodaemun2026';

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

  function aggregateStudents(submissions, worksheetFilter) {
    const filter = worksheetFilter || 'all';
    const byStudent = {};

    (submissions || []).forEach(function (sub) {
      if (filter !== 'all' && sub.worksheet !== filter) return;
      const key = sub.classNo + '_' + sub.studentCode;
      if (!byStudent[key]) {
        byStudent[key] = {
          classNo: Number(sub.classNo) || 0,
          number: Number(sub.number) || 0,
          studentCode: String(sub.studentCode || ''),
          name: String(sub.name || ''),
          basicSubs: [],
          leafletSubs: []
        };
      }
      if (sub.worksheet === 'basic') {
        byStudent[key].basicSubs.push(sub);
      } else if (sub.worksheet === 'leaflet') {
        byStudent[key].leafletSubs.push(sub);
      }
    });

    function sortSubs(list) {
      return list.slice().sort(function (a, b) {
        const aa = Number(a.attempt) || 1;
        const ba = Number(b.attempt) || 1;
        if (aa !== ba) return aa - ba;
        return String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''));
      });
    }

    return Object.keys(byStudent).map(function (key) {
      const entry = byStudent[key];
      const basicList = sortSubs(entry.basicSubs);
      const leafletList = sortSubs(entry.leafletSubs);

      const basicFirst = basicList[0] || null;
      const basicLatest = basicList[basicList.length - 1] || null;
      const leafletFirst = leafletList[0] || null;
      const leafletLatest = leafletList[leafletList.length - 1] || null;

      const scores = [];
      if (basicFirst) scores.push(Number(basicFirst.accuracy) || 0);
      if (leafletFirst) scores.push(Number(leafletFirst.accuracy) || 0);
      const avgAcc = scores.length
        ? Math.round((scores.reduce(function (s, v) { return s + v; }, 0) / scores.length) * 10) / 10
        : 0;

      // Choose primary reflection from latest submission (prefer leaflet if both latest exist at same time, else whichever has longer/newer reflection)
      const latestCandidates = [];
      if (basicLatest) latestCandidates.push(basicLatest);
      if (leafletLatest) latestCandidates.push(leafletLatest);
      latestCandidates.sort(function (a, b) {
        return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
      });
      const primaryLatest = latestCandidates[0] || {};

      const firstTimes = [];
      if (basicFirst && basicFirst.submittedAt) firstTimes.push(String(basicFirst.submittedAt));
      if (leafletFirst && leafletFirst.submittedAt) firstTimes.push(String(leafletFirst.submittedAt));
      firstTimes.sort();

      const reflection20 = String(primaryLatest.reflection20 || '');
      const activityThink = String(primaryLatest.activityThink || '');
      const selectedPick = String(primaryLatest.selectedPick || '');
      const reflectionReason = String(primaryLatest.reflectionReason || '');

      return {
        classNo: entry.classNo,
        number: entry.number,
        studentCode: entry.studentCode,
        name: entry.name,
        accuracy: avgAcc,
        basicAccuracy: basicFirst ? Number(basicFirst.accuracy) : null,
        basicAttempts: basicList.length,
        leafletAccuracy: leafletFirst ? Number(leafletFirst.accuracy) : null,
        leafletAttempts: leafletList.length,
        maxAttempts: Math.max(basicList.length, leafletList.length),
        wrongItems: String(primaryLatest.wrongItems || ''),
        activityThink: activityThink,
        selectedPick: selectedPick,
        reflectionReason: reflectionReason,
        reflection20: reflection20,
        reflectionLength: reflection20.trim().length,
        firstSubmittedAt: firstTimes[0] || '',
        latestSubmittedAt: String(primaryLatest.submittedAt || '')
      };
    });
  }

  function sortStudents(students, sortMode) {
    const mode = sortMode || 'accuracy';
    return (students || []).slice().sort(function (a, b) {
      if (mode === 'number') {
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
      if (keepExisting && nextMap[s.studentCode]) return false;
      return s.accuracy >= minAccuracy && s.reflectionLength >= minReflectionLen;
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
      return (
        '<tr>' +
          '<td class="num">' + escapeHtml(s.classNo + '반 ' + s.number + '번') + '</td>' +
          '<td class="name">' + escapeHtml(s.name) + '</td>' +
          '<td class="acc">' + escapeHtml(s.accuracy + '%') + '</td>' +
          '<td class="sel">' + selBadge + '</td>' +
          '<td class="pick">' + escapeHtml(s.selectedPick || '-') + '</td>' +
          '<td class="body">' +
            (s.activityThink ? '<div class="sub-item"><strong>[생각해 보기/활동1]</strong> ' + escapeHtml(s.activityThink) + '</div>' : '') +
            (s.reflectionReason ? '<div class="sub-item"><strong>[인상 깊은 이유]</strong> ' + escapeHtml(s.reflectionReason) + '</div>' : '') +
            '<div class="sub-item"><strong>[20번 다짐·소감]</strong> ' + escapeHtml(s.reflection20 || '-') + '</div>' +
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

  function buildSampleDataset() {
    const familyNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신'];
    const givenNames = ['서준', '지우', '하은', '도윤', '수아', '민준', '예린', '시우', '지민', '유진', '건우', '채원', '현우', '소율'];
    const picks = [
      '여옥사(유관순 지하감옥)',
      '격벽장',
      '보안과청사·지하 고문실',
      '사형장·시구문·미루나무',
      '중앙사 및 옥사',
      '유관순 열사',
      '한용운 선사',
      '안창호 선생',
      '강우규 의사'
    ];
    const thinks = [
      '적은 수의 간수가 한눈에 수감자들을 감시하고, 서로 눈빛이나 말도 나누지 못하도록 철저히 통제하기 위해 부채꼴로 설계했습니다.',
      '독립운동가들의 의지를 꺾고 서로 연대하지 못하도록 운동 시간까지 칸막이로 갈라놓아 고립시키려 한 것이 인상 깊었습니다.',
      '부채꼴 파놉티콘 구조는 감시 효율을 극대화해 수감자에게 끊임없이 감시당한다는 압박감을 주려던 일제의 통제 방식입니다.'
    ];
    const reasons = [
      '좁고 어두운 감방에서도 끝까지 대한독립 만세를 외쳤다는 설명을 보고 큰 울림을 느꼈습니다.',
      '운동장마저 벽으로 갈라놓은 격벽장을 직접 보니 당시의 숨 막히는 억압이 생생하게 전해졌습니다.',
      '어린 나이와 고령을 가리지 않고 나라를 위해 목숨을 바친 용기가 너무나 감사하고 존경스러웠습니다.'
    ];
    const reflections = [
      '오늘날 우리가 당연하게 누리는 자유와 평화가 수많은 독립운동가분들의 희생 위에서 이루어졌음을 깊이 깨달았습니다. 역사를 잊지 않고 일상 속에서 인권과 평화를 소중히 지키며 살아가겠습니다.',
      '유관순 열사님과 이름 모를 많은 학생 독립운동가분들이 차가운 옥사에서도 꺾이지 않고 지켜 낸 대한민국을 더 정의롭고 따뜻한 나라로 이어가겠습니다. 정말 감사합니다.',
      '사형장과 통곡의 미루나무 앞에서 발걸음이 떨어지지 않았습니다. 조국 독립을 못 본 채 눈을 감으셔야 했던 분들의 뜻을 기억하며 부끄럽지 않은 시민으로 성장하겠습니다.',
      '교과서 글로만 보던 수형기록표와 지하 고문실을 직접 보며 마음이 무거워졌습니다. 아픈 역사를 정확히 기억하고 차별과 폭력에 맞서는 용기를 배우겠습니다.',
      '독립운동가들의 희생에 진심으로 감사드리며 자유를 소중히 여기는 사람이 되겠습니다.'
    ];
    const scoresPool = [19, 19, 19, 18, 18, 17, 17, 16, 15, 14, 18, 16];

    const submissions = [];
    for (let c = 1; c <= 7; c += 1) {
      const count = 12;
      for (let idx = 0; idx < count; idx += 1) {
        const number = idx + 1;
        const name = familyNames[(c * 3 + idx) % familyNames.length] + givenNames[(c * 5 + idx) % givenNames.length];
        const studentCode = '1' + c + String(number).padStart(2, '0');
        const score = scoresPool[(c + idx) % scoresPool.length];
        const accuracy = Math.round((score / 19) * 1000) / 10;
        const ws = idx % 3 === 0 ? 'basic' : 'leaflet';
        const ref = reflections[(c + idx) % reflections.length];
        const minute = String(10 + idx * 3).padStart(2, '0');
        submissions.push({
          submittedAt: '2026-11-23 11:' + minute + ':15',
          classNo: c,
          number: number,
          studentCode: studentCode,
          name: name,
          worksheet: ws,
          score: score,
          total: 19,
          accuracy: accuracy,
          attempt: 1,
          wrongItems: score === 19 ? '' : '6번, 14번',
          activityThink: thinks[(c + idx) % thinks.length],
          selectedPick: picks[(c + idx) % picks.length],
          reflectionReason: reasons[(c + idx) % reasons.length],
          reflection20: ref,
          reflectionLength: ref.length,
          answersJson: '{}'
        });

        // Add dual-worksheet completion for first 2 students of each class
        if (idx < 2) {
          const otherWs = ws === 'basic' ? 'leaflet' : 'basic';
          const score2 = Math.max(15, score - 1);
          submissions.push({
            submittedAt: '2026-11-23 11:' + String(48 + idx).padStart(2, '0') + ':02',
            classNo: c,
            number: number,
            studentCode: studentCode,
            name: name,
            worksheet: otherWs,
            score: score2,
            total: 19,
            accuracy: Math.round((score2 / 19) * 1000) / 10,
            attempt: 1,
            wrongItems: '12번',
            activityThink: thinks[(c + idx) % thinks.length],
            selectedPick: picks[(c + idx) % picks.length],
            reflectionReason: reasons[(c + idx) % reasons.length],
            reflection20: ref,
            reflectionLength: ref.length,
            answersJson: '{}'
          });
        }
      }
    }

    // Pre-mark 1반 top 5 as sample selections so teachers see how selection sync works
    const class1Students = sortStudents(
      aggregateStudents(submissions.filter(function (s) { return s.classNo === 1; }), 'all'),
      'accuracy'
    );
    const selections = class1Students.slice(0, 5).map(function (s) {
      return {
        classNo: 1,
        studentCode: s.studentCode,
        name: s.name,
        accuracy: s.accuracy,
        method: '직접선정',
        selectedAt: '2026-11-23 11:52:00',
        note: '샘플 선정'
      };
    });

    return { submissions: submissions, selections: selections };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escapeCsvCell: escapeCsvCell,
      generateCsv: generateCsv,
      generateReflectionHtml: generateReflectionHtml,
      aggregateStudents: aggregateStudents,
      sortStudents: sortStudents,
      runConditionalDraw: runConditionalDraw,
      buildSampleDataset: buildSampleDataset
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
    worksheetFilter: 'all',
    sortMode: 'accuracy',
    searchQuery: '',
    viewMode: 'table',
    targetCount: CONFIG.giftTarget || 10,
    drawPanelOpen: false,
    drawMinAccuracy: 80,
    drawMinReflectionLen: 10,
    drawKeepExisting: true,
    justDrawnCodes: [],
    submissions: [],
    selectionsByClass: {},
    dirtyClasses: {}
  };

  const els = {
    loginView: document.getElementById('loginView'),
    dashView: document.getElementById('dashView'),
    pinInput: document.getElementById('pinInput'),
    loginBtn: document.getElementById('loginBtn'),
    demoEnterBtn: document.getElementById('demoEnterBtn'),
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

  function loadLocalPreviewData() {
    const sample = buildSampleDataset();
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

    state.submissions = (localSubs || []).concat(sample.submissions);
    state.selectionsByClass = organizeSelections(sample.selections);
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
      showToast(classNo + '반 선정 명단(' + winners.length + '명)이 미리보기 브라우저에 저장되었습니다.');
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

  function getClassStudents(classNo, filterOverride) {
    const rawSubs = state.submissions.filter(function (s) {
      return Number(s.classNo) === Number(classNo);
    });
    const filter = filterOverride !== undefined ? filterOverride : state.worksheetFilter;
    return aggregateStudents(rawSubs, filter);
  }

  function filterBySearch(students) {
    const q = String(state.searchQuery || '').trim().toLowerCase();
    if (!q) return students;
    return students.filter(function (s) {
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

  function buildCsvRowsForStudents(students, selectionsMapGlobal) {
    return students.map(function (s) {
      const selMap = selectionsMapGlobal[s.classNo] || {};
      const sel = selMap[s.studentCode];
      return [
        s.classNo + '반',
        s.number,
        s.studentCode,
        s.name,
        s.basicAccuracy !== null ? s.basicAccuracy : '',
        s.leafletAccuracy !== null ? s.leafletAccuracy : '',
        s.accuracy,
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

  const REFLECTION_CSV_HEADERS = [
    '반',
    '번호',
    '학번',
    '이름',
    '활동지①정답률(%)',
    '활동지②정답률(%)',
    '대표정답률(%)',
    '선정여부',
    '선정방식',
    '활동1_생각해보기',
    '선택공간_인물',
    '나만의기록_이유',
    '20번_소감다짐',
    '소감글자수',
    '최초제출시각'
  ];

  function exportClassReflectionsCsv(classNo) {
    const students = sortStudents(getClassStudents(classNo, 'all'), 'number');
    const csv = generateCsv(REFLECTION_CSV_HEADERS, buildCsvRowsForStudents(students, state.selectionsByClass));
    downloadTextFile('서대문형무소_1학년' + classNo + '반_소감문.csv', csv, 'text/csv;charset=utf-8');
  }

  function exportClassReflectionsHtml(classNo) {
    const students = sortStudents(getClassStudents(classNo, 'all'), 'number');
    const html = generateReflectionHtml(
      '서대문형무소역사관 현장체험학습 소감문 모음 (1학년 ' + classNo + '반)',
      students,
      state.selectionsByClass[classNo] || {}
    );
    downloadTextFile('서대문형무소_1학년' + classNo + '반_소감문_인쇄용.html', html, 'text/html;charset=utf-8');
  }

  function exportClassWinnersCsv(classNo) {
    const students = sortStudents(getClassStudents(classNo, 'all'), 'accuracy');
    const classSel = state.selectionsByClass[classNo] || {};
    const winners = students.filter(function (s) { return Boolean(classSel[s.studentCode]); });
    const headers = ['반', '번호', '학번', '이름', '대표정답률(%)', '선정방식', '소감글자수', '20번_소감다짐'];
    const rows = winners.map(function (s) {
      const sel = classSel[s.studentCode];
      return [s.classNo + '반', s.number, s.studentCode, s.name, s.accuracy, sel.method, s.reflectionLength, s.reflection20];
    });
    downloadTextFile('서대문형무소_1학년' + classNo + '반_문화상품권선정_' + winners.length + '명.csv', generateCsv(headers, rows), 'text/csv;charset=utf-8');
  }

  function exportAllWinnersCsv() {
    const headers = ['반', '번호', '학번', '이름', '대표정답률(%)', '선정방식', '선정시각', '20번_소감다짐'];
    const rows = [];
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) {
      const students = sortStudents(getClassStudents(c, 'all'), 'number');
      const classSel = state.selectionsByClass[c] || {};
      students.forEach(function (s) {
        const sel = classSel[s.studentCode];
        if (sel) {
          rows.push([c + '반', s.number, s.studentCode, s.name, s.accuracy, sel.method, sel.selectedAt || '', s.reflection20]);
        }
      });
    });
    downloadTextFile('서대문형무소_1~7반_문화상품권선정명단_' + rows.length + '명.csv', generateCsv(headers, rows), 'text/csv;charset=utf-8');
  }

  function exportAllReflectionsCsv() {
    let allStudents = [];
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) {
      allStudents = allStudents.concat(sortStudents(getClassStudents(c, 'all'), 'number'));
    });
    const csv = generateCsv(REFLECTION_CSV_HEADERS, buildCsvRowsForStudents(allStudents, state.selectionsByClass));
    downloadTextFile('서대문형무소_1~7반_전체소감문.csv', csv, 'text/csv;charset=utf-8');
  }

  function exportAllReflectionsHtml() {
    let allStudents = [];
    const mergedSel = {};
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) {
      allStudents = allStudents.concat(sortStudents(getClassStudents(c, 'all'), 'number'));
      Object.assign(mergedSel, state.selectionsByClass[c] || {});
    });
    const html = generateReflectionHtml('서대문형무소역사관 현장체험학습 1~7반 전체 소감문', allStudents, mergedSel);
    downloadTextFile('서대문형무소_1~7반_전체소감문_인쇄용.html', html, 'text/html;charset=utf-8');
  }

  function renderTabs() {
    const classes = CONFIG.classes || [1, 2, 3, 4, 5, 6, 7];
    const allStudents = aggregateStudents(state.submissions, 'all');
    let totalWinners = 0;
    classes.forEach(function (c) {
      totalWinners += Object.keys(state.selectionsByClass[c] || {}).length;
    });

    const parts = [];
    parts.push(
      '<button type="button" class="class-tab' + (state.activeTab === 'overview' ? ' active' : '') + '" data-tab="overview">' +
        '<span>전체 현황 (1~7반)</span>' +
        '<span class="class-tab-meta">' + allStudents.length + '명 · 선정 ' + totalWinners + '/70</span>' +
      '</button>'
    );

    classes.forEach(function (c) {
      const cStudents = getClassStudents(c, 'all');
      const selCount = Object.keys(state.selectionsByClass[c] || {}).length;
      const dirty = state.dirtyClasses[c] ? ' *' : '';
      parts.push(
        '<button type="button" class="class-tab' + (state.activeTab === String(c) ? ' active' : '') + '" data-tab="' + c + '">' +
          '<span>' + c + '반' + dirty + '</span>' +
          '<span class="class-tab-meta">' + cStudents.length + '명 · ' + selCount + '/' + state.targetCount + '</span>' +
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
    const allStudents = aggregateStudents(state.submissions, 'all');
    const avgAll = allStudents.length
      ? (Math.round((allStudents.reduce(function (s, st) { return s + st.accuracy; }, 0) / allStudents.length) * 10) / 10)
      : 0;
    let totalSelected = 0;
    classes.forEach(function (c) {
      totalSelected += Object.keys(state.selectionsByClass[c] || {}).length;
    });

    const cardsHtml = classes.map(function (c) {
      const list = getClassStudents(c, 'all');
      const avg = list.length
        ? Math.round((list.reduce(function (s, st) { return s + st.accuracy; }, 0) / list.length) * 10) / 10
        : 0;
      const selCount = Object.keys(state.selectionsByClass[c] || {}).length;
      const done = selCount >= state.targetCount;
      return (
        '<div class="class-summary-card" data-jump-class="' + c + '">' +
          '<div class="class-summary-head">' +
            '<span class="class-summary-name">1학년 ' + c + '반</span>' +
            '<span class="badge ' + (done ? 'badge-ok' : 'badge-warn') + '">' + selCount + ' / ' + state.targetCount + '명 선정</span>' +
          '</div>' +
          '<div style="font-size:14px;">참여 학생: <strong>' + list.length + '명</strong></div>' +
          '<div style="font-size:14px;">평균 정답률: <strong>' + avg + '%</strong></div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:6px;">눌러서 ' + c + '반 소감·선정 보기 →</div>' +
        '</div>'
      );
    }).join('');

    els.tabContent.innerHTML =
      '<div class="kpi-grid">' +
        '<div class="kpi-card"><div class="kpi-label">전체 참여 학생</div><div class="kpi-value">' + allStudents.length + '명</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">1~7반 평균 정답률</div><div class="kpi-value">' + avgAll + '%</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">문화상품권 선정 현황</div><div class="kpi-value">' + totalSelected + ' / ' + (classes.length * state.targetCount) + '명</div></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="toolbar-row">' +
          '<h2 style="margin:0;font-size:18px;color:var(--navy);">전체(1~7반) 통합 다운로드</h2>' +
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
    const baseStudents = getClassStudents(classNo, state.worksheetFilter);
    const filtered = filterBySearch(baseStudents);
    const sorted = sortStudents(filtered, state.sortMode);
    const classSel = state.selectionsByClass[classNo] || {};
    const selectedCount = Object.keys(classSel).length;
    const isDirty = Boolean(state.dirtyClasses[classNo]);

    // Draw panel candidate count preview
    const allClassStudentsForDraw = sortStudents(getClassStudents(classNo, 'all'), 'accuracy');
    const drawCandidates = allClassStudentsForDraw.filter(function (s) {
      if (state.drawKeepExisting && classSel[s.studentCode]) return false;
      return s.accuracy >= state.drawMinAccuracy && s.reflectionLength >= state.drawMinReflectionLen;
    });
    const neededNow = state.drawKeepExisting
      ? Math.max(0, state.targetCount - selectedCount)
      : state.targetCount;

    const presetsHtml = [0, 70, 80, 90, 100].map(function (val) {
      return '<button type="button" class="preset-btn' + (state.drawMinAccuracy === val ? ' active' : '') + '" data-min-acc="' + val + '">' + (val === 0 ? '제한없음' : val + '% 이상') + '</button>';
    }).join('');

    let bodyHtml = '';
    if (sorted.length === 0) {
      bodyHtml = '<p style="text-align:center;padding:36px 12px;color:var(--muted);">조건에 맞는 제출 내역이 없습니다.</p>';
    } else if (state.viewMode === 'table') {
      const rows = sorted.map(function (s) {
        const sel = classSel[s.studentCode];
        const justDrawn = state.justDrawnCodes.indexOf(s.studentCode) !== -1;
        const wsBadges = [];
        if (s.basicAccuracy !== null) {
          wsBadges.push('<span class="badge badge-navy">① ' + s.basicAccuracy + '%' + (s.basicAttempts > 1 ? ' (' + s.basicAttempts + '차)' : '') + '</span>');
        }
        if (s.leafletAccuracy !== null) {
          wsBadges.push('<span class="badge badge-navy">② ' + s.leafletAccuracy + '%' + (s.leafletAttempts > 1 ? ' (' + s.leafletAttempts + '차)' : '') + '</span>');
        }
        return (
          '<tr class="' + (sel ? 'selected-row' : '') + (justDrawn ? ' just-drawn' : '') + '">' +
            '<td><input type="checkbox" class="select-chk" data-toggle-sel="' + escapeHtml(s.studentCode) + '" ' + (sel ? 'checked' : '') + ' aria-label="' + escapeHtml(s.name) + ' 선정" /></td>' +
            '<td><strong>' + s.number + '번</strong></td>' +
            '<td><strong>' + escapeHtml(s.name) + '</strong><div style="font-size:11.5px;color:var(--muted);">' + escapeHtml(s.studentCode) + '</div></td>' +
            '<td><span class="score-pill' + (s.accuracy >= 85 ? ' high' : '') + '">' + s.accuracy + '%</span><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' + wsBadges.join('') + '</div></td>' +
            '<td>' + (sel ? '<span class="badge badge-gold">' + escapeHtml(sel.method || '직접선정') + '</span>' : '-') + '</td>' +
            '<td><div class="reflection-preview">' + escapeHtml(s.reflection20 || '(미작성)') + '</div>' +
              '<div class="reflection-meta">선택: ' + escapeHtml(s.selectedPick || '-') + ' · 소감 ' + s.reflectionLength + '자</div></td>' +
            '<td style="white-space:nowrap;font-size:12.5px;color:var(--muted);">' + escapeHtml((s.firstSubmittedAt || '').slice(5, 16)) + '</td>' +
          '</tr>'
        );
      }).join('');

      bodyHtml =
        '<div class="table-wrap">' +
          '<table class="data-table">' +
            '<thead><tr><th>선정</th><th>번호</th><th>이름</th><th>정답률 (1차 공식)</th><th>방식</th><th>20번 소감·다짐 / 선택 공간</th><th>제출시각</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>';
    } else {
      const cards = sorted.map(function (s) {
        const sel = classSel[s.studentCode];
        const justDrawn = state.justDrawnCodes.indexOf(s.studentCode) !== -1;
        return (
          '<article class="reflection-card' + (sel ? ' selected-row' : '') + (justDrawn ? ' just-drawn' : '') + '">' +
            '<div class="reflection-card-head">' +
              '<div>' +
                '<div style="font-size:17px;font-weight:800;color:var(--navy);">' + s.number + '번 ' + escapeHtml(s.name) + '</div>' +
                '<div style="font-size:12.5px;color:var(--muted);">정답률 <strong style="color:var(--brick);">' + s.accuracy + '%</strong> · 소감 ' + s.reflectionLength + '자</div>' +
              '</div>' +
              '<label style="display:inline-flex;align-items:center;gap:6px;font-weight:800;cursor:pointer;">' +
                '<input type="checkbox" class="select-chk" data-toggle-sel="' + escapeHtml(s.studentCode) + '" ' + (sel ? 'checked' : '') + ' />' +
                '<span>' + (sel ? '선정됨' : '선정') + '</span>' +
              '</label>' +
            '</div>' +
            (s.selectedPick ? '<div class="reflection-block"><div class="reflection-block-label">선택한 공간 / 인물</div>' + escapeHtml(s.selectedPick) + '</div>' : '') +
            (s.activityThink ? '<div class="reflection-block"><div class="reflection-block-label">생각해 보기 / 활동 1</div>' + escapeHtml(s.activityThink) + '</div>' : '') +
            (s.reflectionReason ? '<div class="reflection-block"><div class="reflection-block-label">마음에 남은 이유</div>' + escapeHtml(s.reflectionReason) + '</div>' : '') +
            '<div class="reflection-block"><div class="reflection-block-label">20번 감사 편지 · 다짐</div>' + escapeHtml(s.reflection20 || '(미작성)') + '</div>' +
          '</article>'
        );
      }).join('');
      bodyHtml = '<div class="reflection-cards">' + cards + '</div>';
    }

    els.tabContent.innerHTML =
      '<div class="card">' +
        '<div class="toolbar-row">' +
          '<div class="filter-group">' +
            '<h2 style="margin:0;font-size:20px;color:var(--navy);">1학년 ' + classNo + '반 (' + sorted.length + '명)</h2>' +
            '<select id="wsFilterSel" class="select-sm" aria-label="활동지 필터">' +
              '<option value="all"' + (state.worksheetFilter === 'all' ? ' selected' : '') + '>통합 보기 (학생별)</option>' +
              '<option value="basic"' + (state.worksheetFilter === 'basic' ? ' selected' : '') + '>활동지 ① 기본형만</option>' +
              '<option value="leaflet"' + (state.worksheetFilter === 'leaflet' ? ' selected' : '') + '>활동지 ② 리플릿형만</option>' +
            '</select>' +
            '<select id="sortModeSel" class="select-sm" aria-label="정렬 기준">' +
              '<option value="accuracy"' + (state.sortMode === 'accuracy' ? ' selected' : '') + '>정답률 높은 순</option>' +
              '<option value="number"' + (state.sortMode === 'number' ? ' selected' : '') + '>번호 순</option>' +
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

        '<!-- 반별 소감문 다운로드 + 선정 저장 바 -->' +
        '<div class="action-bar">' +
          '<div class="selection-status">' +
            '<span class="selection-count">' + classNo + '반 문화상품권 선정: <strong>' + selectedCount + '</strong> / ' + state.targetCount + '명</span>' +
            (isDirty ? '<span class="unsaved-pill">저장 안 된 변경 있음</span>' : '') +
            '<button type="button" class="btn btn-outline" id="toggleDrawPanelBtn">' + (state.drawPanelOpen ? '추첨 창 닫기 ▲' : '조건부 / 동점자 추첨 ▼') + '</button>' +
            '<button type="button" class="btn btn-ok" id="saveSelBtn">' + classNo + '반 선정 결과 저장</button>' +
          '</div>' +
          '<div class="filter-group">' +
            '<button type="button" class="btn btn-navy" id="dlClassRefCsvBtn">' + classNo + '반 소감문 CSV 다운로드</button>' +
            '<button type="button" class="btn btn-outline" id="dlClassRefHtmlBtn">' + classNo + '반 소감문 문서(인쇄/HTML)</button>' +
            '<button type="button" class="btn btn-outline" id="dlClassWinCsvBtn">' + classNo + '반 선정 명단 CSV</button>' +
          '</div>' +
        '</div>' +

        '<!-- 조건부 / 동점자 추첨 패널 -->' +
        '<div class="draw-panel" id="drawPanel"' + (state.drawPanelOpen ? '' : ' hidden') + '>' +
          '<strong>조건부 / 동점자 랜덤 추첨 (' + classNo + '반)</strong>' +
          '<p style="margin:4px 0 8px;font-size:13px;color:#78350f;">정답률 상위 동점자가 많거나, 일정 기준을 넘긴 학생들 가운데 공정하게 랜덤 추첨하고 싶을 때 사용하세요.</p>' +
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
            '<span style="font-size:13.5px;font-weight:700;color:#78350f;">현재 조건 충족 후보: <strong>' + drawCandidates.length + '명</strong> · 이번 추첨 예정: <strong>' + Math.min(neededNow, drawCandidates.length) + '명</strong></span>' +
            '<div class="filter-group">' +
              '<button type="button" class="btn btn-outline" id="clearSelBtn">이 반 체크 전체 해제</button>' +
              '<button type="button" class="btn btn-primary" id="runDrawBtn">공정 랜덤 추첨 실행</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        bodyHtml +
      '</div>';

    // Bind events
    document.getElementById('wsFilterSel').addEventListener('change', function (e) {
      state.worksheetFilter = e.target.value;
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
        if (chk.checked && st) {
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
        showToast('설정한 조건을 만족하는 미선정 후보 학생이 없습니다.', true);
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
        '<strong>샘플·미리보기 모드:</strong> 1~7반 체험용 학생 데이터(방금 학생 화면에서 제출한 미리보기 기록 포함)가 표시되고 있습니다. 구글 시트 연동 후 실제 반별 기록이 실시간으로 모입니다.';
    } else {
      els.modeBanner.className = 'mode-banner live';
      els.modeBannerText.innerHTML =
        '<strong>구글 시트 실시간 연결됨:</strong> 1~7반 선생님들이 함께 조회하고 반별 10명 선정을 저장할 수 있습니다.';
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
    if (!CONFIG.apiUrl) {
      if (pin !== DEFAULT_PIN) {
        els.loginError.textContent = '구글 시트 연결 전 기본 비밀번호는 ' + DEFAULT_PIN + ' 입니다. 또는 아래 샘플 미리보기를 누르세요.';
        els.loginError.hidden = false;
        return;
      }
      state.authenticated = true;
      state.demoMode = true;
      state.pin = pin;
      loadLocalPreviewData();
      renderAll();
      return;
    }

    try {
      els.loginBtn.disabled = true;
      els.loginBtn.textContent = '확인 중…';
      await fetchLiveDashboard(pin);
      state.authenticated = true;
      state.demoMode = false;
      state.pin = pin;
      try { root.sessionStorage.setItem(SESSION_PIN_KEY, pin); } catch (e) {}
      renderAll();
    } catch (err) {
      els.loginError.textContent = err.message === 'INVALID_PIN'
        ? '비밀번호가 일치하지 않습니다.'
        : '서버 연결 실패: ' + err.message;
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

    els.demoEnterBtn.addEventListener('click', function () {
      state.authenticated = true;
      state.demoMode = true;
      loadLocalPreviewData();
      renderAll();
      showToast('1~7반 샘플 데이터로 대시보드를 열었습니다.');
    });

    els.refreshBtn.addEventListener('click', async function () {
      if (Object.keys(state.dirtyClasses).some(function (k) { return state.dirtyClasses[k]; })) {
        if (!root.confirm('아직 저장하지 않은 선정 체크가 있습니다. 새로고침하시겠습니까?')) return;
      }
      if (state.demoMode || !CONFIG.apiUrl) {
        loadLocalPreviewData();
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
      try { root.sessionStorage.removeItem(SESSION_PIN_KEY); } catch (e) {}
      els.dashView.hidden = true;
      els.loginView.hidden = false;
      els.copyClassLinkBtn.hidden = true;
      els.refreshBtn.hidden = true;
      els.logoutBtn.hidden = true;
      els.pinInput.value = '';
    });

    // Auto-restore live session if PIN already stored
    try {
      const savedPin = root.sessionStorage.getItem(SESSION_PIN_KEY);
      if (savedPin && CONFIG.apiUrl) {
        tryLoginWithPin(savedPin);
      }
    } catch (e) {}
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
