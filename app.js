'use strict';

(function (root) {
  const STORAGE_KEY = 'seodaemun_student_state_v1';
  const DEMO_SUBMISSIONS_KEY = 'seodaemun_demo_submissions';
  const CIRCLED_NUMS = ['①', '②', '③', '④'];

  function normalizeShortAnswer(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase();
  }

  function gradeQuiz(wsData, answersMap) {
    const answers = answersMap || {};
    let score = 0;
    let total = 0;
    const wrongNums = [];
    const details = {};

    wsData.questions.forEach(function (q) {
      if (q.type === 'essay') return;
      total += 1;
      const raw = answers[String(q.num)];
      let isCorrect = false;
      if (q.type === 'ox') {
        isCorrect = String(raw || '').toUpperCase() === String(q.answer).toUpperCase();
      } else if (q.type === 'mcq') {
        isCorrect = raw !== undefined && raw !== '' && Number(raw) === Number(q.answer);
      } else if (q.type === 'short') {
        isCorrect = normalizeShortAnswer(raw) !== '' &&
          normalizeShortAnswer(raw) === normalizeShortAnswer(q.answer);
      }

      if (isCorrect) {
        score += 1;
      } else {
        wrongNums.push(q.num + '번');
      }
      details[String(q.num)] = {
        userAnswer: raw == null ? '' : raw,
        correctAnswer: q.answer,
        isCorrect: isCorrect,
        explanation: q.explanation || ''
      };
    });

    const accuracy = total > 0 ? Math.round((score / total) * 1000) / 10 : 0;
    return { score: score, total: total, accuracy: accuracy, wrongNums: wrongNums, details: details };
  }

  function validateSubmission(student, wsState, wsData, teacherMode) {
    if (teacherMode) return { valid: true };
    const classNo = Number(student && student.classNo);
    const num = Number(student && student.number);
    const name = String((student && student.name) || '').trim();

    if (!(classNo >= 1 && classNo <= 7)) {
      return { valid: false, message: '먼저 몇 반인지 선택해 주세요 (1~7반).', targetId: 'studentInfoHeading' };
    }
    if (!Number.isInteger(num) || num < 1 || num > 50) {
      return { valid: false, message: '번호를 1~50 사이 숫자로 입력해 주세요.', targetId: 'studentNumber' };
    }
    if (!name) {
      return { valid: false, message: '이름을 입력해 주세요.', targetId: 'studentName' };
    }

    const answers = (wsState && wsState.answers) || {};
    for (let i = 0; i < wsData.questions.length; i += 1) {
      const q = wsData.questions[i];
      const val = answers[String(q.num)];
      if (q.type === 'essay') {
        const text = String(val || '').trim();
        if (text.length < 5) {
          return {
            valid: false,
            message: q.num + '번 다짐·소감을 5자 이상 적어 주세요.',
            targetId: 'q-' + q.num,
            missingQ: q.num
          };
        }
      } else if (val === undefined || val === null || String(val).trim() === '') {
        return {
          valid: false,
          message: q.num + '번 문항에 아직 답을 고르지 않았습니다.',
          targetId: 'q-' + q.num,
          missingQ: q.num
        };
      }
    }
    return { valid: true };
  }

  function buildStudentCode(grade, classNo, number) {
    const g = String(Number(grade) || 1);
    const c = String(Number(classNo) || 0);
    const n = String(Number(number) || 0).padStart(2, '0');
    return g + c + n;
  }

  function buildSubmissionPayload(student, wsId, wsState, wsData, graded, defaultGrade) {
    const grade = Number(student.grade || defaultGrade || 1);
    const classNo = Number(student.classNo);
    const number = Number(student.number);
    const name = String(student.name || '').trim();
    const reflection20 = String((wsState.answers && wsState.answers['20']) || '').trim();

    return {
      action: 'submit',
      grade: grade,
      classNo: classNo,
      number: number,
      studentCode: buildStudentCode(grade, classNo, number),
      name: name,
      worksheet: wsId,
      worksheetTitle: wsData.shortLabel,
      score: graded.score,
      total: graded.total,
      accuracy: graded.accuracy,
      wrongItems: graded.wrongNums.join(', '),
      activityThink: String(wsState.activityThink || '').trim(),
      selectedPick: String(wsState.selectedPick || '').trim(),
      reflectionReason: String(wsState.reflectionReason || '').trim(),
      reflection20: reflection20,
      reflectionLength: reflection20.length,
      answersJson: JSON.stringify(wsState.answers || {})
    };
  }

  function formatKoreanDateTime(isoOrDate) {
    const d = isoOrDate ? new Date(isoOrDate) : new Date();
    if (Number.isNaN(d.getTime())) return String(isoOrDate || '');
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
  }

  // Export pure helpers for automated testing in Node.js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      normalizeShortAnswer: normalizeShortAnswer,
      gradeQuiz: gradeQuiz,
      validateSubmission: validateSubmission,
      buildStudentCode: buildStudentCode,
      buildSubmissionPayload: buildSubmissionPayload
    };
  }

  // Stop here if running outside the browser DOM
  if (typeof document === 'undefined') return;

  const CONFIG = root.SEODAEMUN_CONFIG || {
    apiUrl: '',
    classes: [1, 2, 3, 4, 5, 6, 7],
    defaultGrade: 1
  };
  const DATA = root.SEODAEMUN_DATA;
  if (!DATA) return;

  const params = new URLSearchParams(root.location.search);
  const teacherMode = params.has('교사') || params.has('teacher');

  function createEmptyWorksheetState() {
    return {
      activityThink: '',
      selectedPick: '',
      reflectionReason: '',
      answers: {},
      checkedRoute: [],
      visitedSpaces: [],
      submissions: []
    };
  }

  function loadState() {
    const base = {
      activeTab: 'basic',
      student: { grade: CONFIG.defaultGrade || 1, classNo: null, number: '', name: '' },
      worksheets: {
        basic: createEmptyWorksheetState(),
        leaflet: createEmptyWorksheetState()
      }
    };
    try {
      const raw = root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (parsed.activeTab && DATA.worksheets[parsed.activeTab]) {
        base.activeTab = parsed.activeTab;
      }
      if (parsed.student) {
        base.student = Object.assign(base.student, parsed.student);
      }
      ['basic', 'leaflet'].forEach(function (id) {
        if (parsed.worksheets && parsed.worksheets[id]) {
          base.worksheets[id] = Object.assign(createEmptyWorksheetState(), parsed.worksheets[id]);
          if (!base.worksheets[id].answers) base.worksheets[id].answers = {};
          if (!Array.isArray(base.worksheets[id].checkedRoute)) base.worksheets[id].checkedRoute = [];
          if (!Array.isArray(base.worksheets[id].visitedSpaces)) base.worksheets[id].visitedSpaces = [];
          if (!Array.isArray(base.worksheets[id].submissions)) base.worksheets[id].submissions = [];
        }
      });
    } catch (e) {
      // Ignore storage parse error
    }
    return base;
  }

  const state = loadState();
  let lastGradedResult = null;
  let saveTimer = null;
  let toastTimer = null;

  const els = {
    teacherModeBar: document.getElementById('teacherModeBar'),
    previewModeBanner: document.getElementById('previewModeBanner'),
    saveBadge: document.getElementById('saveBadge'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    classPills: document.getElementById('classPills'),
    studentNumber: document.getElementById('studentNumber'),
    studentName: document.getElementById('studentName'),
    wsTabs: document.getElementById('wsTabs'),
    worksheetRoot: document.getElementById('worksheetRoot'),
    resultSection: document.getElementById('resultSection'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxCaption: document.getElementById('lightboxCaption'),
    lightboxClose: document.getElementById('lightboxClose'),
    toast: document.getElementById('toast')
  };

  function showToast(msg, isError) {
    els.toast.textContent = msg;
    els.toast.className = 'toast' + (isError ? ' error' : '');
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.hidden = true;
    }, 3400);
  }

  function saveState() {
    els.saveBadge.textContent = '저장 중…';
    els.saveBadge.classList.add('saving');
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore quota exceeded
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      els.saveBadge.textContent = '자동 저장됨';
      els.saveBadge.classList.remove('saving');
    }, 250);
    updateProgress();
  }

  function updateProgress() {
    const wsData = DATA.worksheets[state.activeTab];
    const wsState = state.worksheets[state.activeTab];
    let answered = 0;
    wsData.questions.forEach(function (q) {
      const val = wsState.answers[String(q.num)];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        answered += 1;
      }
    });
    const pct = Math.round((answered / wsData.questions.length) * 100);
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = '퀴즈 ' + answered + ' / ' + wsData.questions.length;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderStudentInfo() {
    els.classPills.innerHTML = '';
    (CONFIG.classes || [1, 2, 3, 4, 5, 6, 7]).forEach(function (c) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'class-pill' + (Number(state.student.classNo) === c ? ' active' : '');
      btn.textContent = c + '반';
      btn.addEventListener('click', function () {
        state.student.classNo = c;
        saveState();
        renderStudentInfo();
      });
      els.classPills.appendChild(btn);
    });
    els.studentNumber.value = state.student.number || '';
    els.studentName.value = state.student.name || '';
  }

  function renderTabs() {
    els.wsTabs.innerHTML = '';
    ['basic', 'leaflet'].forEach(function (id) {
      const ws = DATA.worksheets[id];
      const wsState = state.worksheets[id];
      const latestSub = wsState.submissions.length > 0 ? wsState.submissions[0] : null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-tab' + (state.activeTab === id ? ' active' : '');
      const badgeClass = latestSub ? 'ws-tab-badge done' : 'ws-tab-badge';
      const badgeText = latestSub
        ? '1차 제출 완료 · ' + latestSub.accuracy + '%'
        : '작성 가능 (미제출)';
      btn.innerHTML =
        '<span class="ws-tab-title">' + escapeHtml(ws.tabTitle) + '</span>' +
        '<span class="' + badgeClass + '">' + escapeHtml(badgeText) + '</span>';
      btn.addEventListener('click', function () {
        if (state.activeTab === id) return;
        state.activeTab = id;
        lastGradedResult = null;
        saveState();
        renderTabs();
        renderWorksheet();
        renderResultSection();
      });
      els.wsTabs.appendChild(btn);
    });
  }

  function openLightbox(src, title, caption) {
    els.lightboxImg.src = src;
    els.lightboxImg.alt = title || '';
    els.lightboxCaption.textContent = (title ? title + ' — ' : '') + (caption || '');
    els.lightbox.hidden = false;
  }

  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImg.src = '';
  }

  function renderSectionHead(numLabel, title, tagText) {
    return (
      '<div class="section-head">' +
        '<div class="section-head-left">' +
          '<span class="sec-num-box" aria-hidden="true">' + escapeHtml(numLabel) + '</span>' +
          '<h2 class="section-title">' + escapeHtml(title) + '</h2>' +
        '</div>' +
        (tagText ? '<span class="sec-tag">' + escapeHtml(tagText) + '</span>' : '') +
      '</div>'
    );
  }

  function renderWorksheet() {
    const wsId = state.activeTab;
    const ws = DATA.worksheets[wsId];
    const wsState = state.worksheets[wsId];
    const htmlParts = [];

    // Recommended Route (leaflet)
    if (ws.routeSteps && ws.routeSteps.length) {
      const routeChips = ws.routeSteps
        .map(function (step, idx) {
          const checked = wsState.checkedRoute.indexOf(step.num) !== -1;
          const chip =
            '<button type="button" class="route-chip' + (checked ? ' checked' : '') + '" data-route="' + step.num + '">' +
            '<span>' + (checked ? '✓' : '○') + '</span>' +
            '<span>' + step.num + '. ' + escapeHtml(step.label) + '</span>' +
            '</button>';
          return (idx > 0 ? '<span class="route-sep" aria-hidden="true">›</span>' : '') + chip;
        })
        .join('');
      htmlParts.push(
        '<section class="card">' +
          '<div class="route-box">' +
            renderSectionHead('길', ws.routeTitle.replace(/^\[현장 리플릿 안내\]\s*/, ''), '추천 동선') +
            '<p class="route-hint">현장을 걸으며 둘러본 곳을 터치해 관람 순서를 체크해 보세요.</p>' +
            '<div class="route-steps">' + routeChips + '</div>' +
          '</div>' +
        '</section>'
      );
    }

    // Intro + Photos + Activity 1 / Think
    const introBody = ws.introParagraphs
      .map(function (p) { return '<p class="lead-text">' + escapeHtml(p) + '</p>'; })
      .join('');

    let photosHtml = '';
    if (ws.photos && ws.photos.length) {
      photosHtml =
        '<div class="photo-grid">' +
        ws.photos
          .map(function (ph) {
            return (
              '<figure class="photo-card">' +
                '<button type="button" class="photo-trigger" data-zoom-src="' + escapeHtml(ph.src) + '" data-zoom-title="' + escapeHtml(ph.title) + '" data-zoom-caption="' + escapeHtml(ph.caption) + '">' +
                  '<img src="' + escapeHtml(ph.src) + '" alt="' + escapeHtml(ph.title) + '" loading="lazy" />' +
                  '<span class="photo-zoom-hint">터치해 확대</span>' +
                '</button>' +
                '<figcaption class="photo-caption"><strong>▲ ' + escapeHtml(ph.title) + ':</strong> ' + escapeHtml(ph.caption) + '</figcaption>' +
              '</figure>'
            );
          })
          .join('') +
        '</div>';
    }

    htmlParts.push(
      '<section class="card">' +
        renderSectionHead('1', ws.introTitle.replace(/^\d+\.\s*/, ''), '역사 이해') +
        introBody +
        photosHtml +
        '<div class="activity-box">' +
          '<h3 class="activity-box-title">' + escapeHtml(ws.activityPromptTitle) + '</h3>' +
          '<p class="activity-box-desc">' + escapeHtml(ws.activityPromptText) + '</p>' +
          '<textarea id="activityThinkInput" class="textarea-box" placeholder="' + escapeHtml(ws.activityPlaceholder) + '">' +
            escapeHtml(wsState.activityThink) +
          '</textarea>' +
        '</div>' +
      '</section>'
    );

    // Timeline (leaflet — PDF 1쪽 연결선 타임라인 스타일)
    if (ws.timeline && ws.timeline.length) {
      const timelineItems = ws.timeline
        .map(function (item, idx) {
          const isEndpoint = idx === 0 || idx === ws.timeline.length - 1;
          return (
            '<div class="timeline-node' + (isEndpoint ? ' endpoint' : '') + '">' +
              '<span class="timeline-dot" aria-hidden="true"></span>' +
              '<div class="timeline-card">' +
                '<div class="timeline-year">' + escapeHtml(item.year) + '</div>' +
                '<div class="timeline-event">' + escapeHtml(item.event) + '</div>' +
              '</div>' +
            '</div>'
          );
        })
        .join('');
      htmlParts.push(
        '<section class="card">' +
          renderSectionHead('2', ws.timelineTitle.replace(/^\d+\.\s*/, ''), '주요 연표') +
          '<div class="timeline-track">' + timelineItems + '</div>' +
        '</section>'
      );
    }

    // Spaces
    const spacesSecNum = ws.id === 'leaflet' ? '3' : '2';
    const spaceItems = ws.spaces
      .map(function (sp) {
        const visited = wsState.visitedSpaces.indexOf(sp.name) !== -1;
        return (
          '<div class="space-card' + (visited ? ' visited' : '') + '" role="button" tabindex="0" data-space-name="' + escapeHtml(sp.name) + '">' +
            '<div>' +
              '<div class="space-name">' + escapeHtml(sp.name) + '</div>' +
              '<div class="space-meaning">' + escapeHtml(sp.meaning) + '</div>' +
            '</div>' +
            '<span class="visit-pill">' + (visited ? '✓ 확인함' : '현장 확인') + '</span>' +
          '</div>'
        );
      })
      .join('');

    htmlParts.push(
      '<section class="card">' +
        renderSectionHead(spacesSecNum, ws.spacesTitle.replace(/^\d+\.\s*/, ''), '공간 탐구') +
        '<p class="lead-text">' + escapeHtml(ws.spacesLead) + '</p>' +
        '<div class="space-list">' + spaceItems + '</div>' +
      '</section>'
    );

    // Figures & Reflection Record
    const figuresSecNum = ws.id === 'leaflet' ? '4' : '3';
    const figureItems = ws.figures
      .map(function (fig) {
        return (
          '<div class="figure-card">' +
            '<div class="figure-head">' +
              '<span class="figure-name">' + escapeHtml(fig.name) + '</span>' +
              (fig.years ? '<span class="figure-years">' + escapeHtml(fig.years) + '</span>' : '') +
            '</div>' +
            '<p class="figure-desc">' + escapeHtml(fig.desc) + '</p>' +
          '</div>'
        );
      })
      .join('');

    const pickChips = ws.quickPicks
      .map(function (label) {
        const selected = wsState.selectedPick === label;
        return (
          '<button type="button" class="quick-chip' + (selected ? ' selected' : '') + '" data-pick="' + escapeHtml(label) + '">' +
            escapeHtml(label) +
          '</button>'
        );
      })
      .join('');

    htmlParts.push(
      '<section class="card">' +
        renderSectionHead(figuresSecNum, ws.figuresTitle.replace(/^\d+\.\s*/, ''), '독립운동가') +
        '<div class="figure-list">' + figureItems + '</div>' +
        '<div class="activity-box">' +
          '<h3 class="activity-box-title">' + escapeHtml(ws.reflectionTitle) + '</h3>' +
          '<p class="activity-box-desc">' + escapeHtml(ws.reflectionGuide) + '</p>' +
          '<label class="field-label" for="selectedPickInput">' + escapeHtml(ws.reflectionPickLabel) + '</label>' +
          '<div class="quick-picks">' + pickChips + '</div>' +
          '<input id="selectedPickInput" class="input-box" type="text" placeholder="위에서 누르거나 직접 입력하세요" value="' + escapeHtml(wsState.selectedPick) + '" style="margin-bottom:10px;" />' +
          '<label class="field-label" for="reflectionReasonInput">' + escapeHtml(ws.reflectionReasonLabel) + '</label>' +
          '<textarea id="reflectionReasonInput" class="textarea-box" placeholder="' + escapeHtml(ws.reflectionReasonPlaceholder) + '">' +
            escapeHtml(wsState.reflectionReason) +
          '</textarea>' +
        '</div>' +
      '</section>'
    );

    // Quiz Header Banner
    htmlParts.push(
      '<section class="quiz-banner">' +
        '<div>' +
          '<div class="quiz-banner-sub">' + escapeHtml(ws.quizSubtitle) + '</div>' +
          '<h2 class="quiz-banner-title">' + escapeHtml(ws.quizTitle) + '</h2>' +
        '</div>' +
        '<span class="sec-tag" style="background:rgba(250,247,241,0.16);color:#fff;border-color:rgba(250,247,241,0.5);">총 20문항</span>' +
      '</section>'
    );

    // Part 1
    htmlParts.push('<div class="part-header"><span>[1부] OX 퀴즈 (1번 ~ 10번) — 맞으면 O, 틀리면 X를 누르세요.</span><span class="sec-tag">퀴즈 1~10번</span></div>');
    ws.questions.filter(function (q) { return q.part === 1; }).forEach(function (q) {
      htmlParts.push(renderQuestionCard(q, wsState.answers[String(q.num)]));
    });

    // Part 2
    htmlParts.push('<div class="part-header"><span>[2부] 객관식 · 단답형 · 서술형 퀴즈 (11번 ~ 20번)</span><span class="sec-tag">퀴즈 11~20번</span></div>');
    ws.questions.filter(function (q) { return q.part === 2; }).forEach(function (q) {
      htmlParts.push(renderQuestionCard(q, wsState.answers[String(q.num)]));
    });

    // Submit Card
    const hasSubmitted = wsState.submissions.length > 0;
    const btnText = teacherMode
      ? '교사 모드: 채점 및 정답·해설 확인하기'
      : hasSubmitted
        ? ws.shortLabel + ' 다시 제출하기 (공식 점수는 1차 제출 유지)'
        : ws.shortLabel + ' 선생님께 제출하기';

    htmlParts.push(
      '<section class="submit-card">' +
        (hasSubmitted && !teacherMode
          ? '<p class="lead-text" style="font-size:14px;color:var(--ok);font-weight:700;">이미 1차 제출을 완료했습니다 (정답률 ' + wsState.submissions[0].accuracy + '%). 소감을 보완해 재제출할 수 있지만, 공식 정답률은 1차 기록으로 유지됩니다.</p>'
          : '<p class="lead-text" style="font-size:14px;color:var(--ink-muted);">모든 문항을 확인한 뒤 아래 버튼을 누르면 자동 채점되고 선생님께 전달됩니다.</p>') +
        '<button type="button" id="submitBtn" class="btn-primary">' + escapeHtml(btnText) + '</button>' +
      '</section>'
    );

    els.worksheetRoot.innerHTML = htmlParts.join('');
    bindWorksheetEvents(ws, wsState);
    applyFeedbackStyles();
    updateProgress();
  }

  function renderQuestionCard(q, userVal) {
    let inputHtml = '';
    if (q.type === 'ox') {
      inputHtml =
        '<div class="ox-row">' +
          '<button type="button" class="ox-btn' + (userVal === 'O' ? ' active' : '') + '" data-q="' + q.num + '" data-val="O">O (맞다)</button>' +
          '<button type="button" class="ox-btn' + (userVal === 'X' ? ' active' : '') + '" data-q="' + q.num + '" data-val="X">X (틀리다)</button>' +
        '</div>';
    } else if (q.type === 'mcq') {
      inputHtml =
        '<div class="mcq-list">' +
        q.options
          .map(function (opt, idx) {
            const val = idx + 1;
            const active = Number(userVal) === val;
            return (
              '<button type="button" class="mcq-btn' + (active ? ' active' : '') + '" data-q="' + q.num + '" data-val="' + val + '">' +
                '<span class="opt-mark">' + CIRCLED_NUMS[idx] + '</span>' +
                '<span>' + escapeHtml(opt) + '</span>' +
              '</button>'
            );
          })
          .join('') +
        '</div>';
    } else if (q.type === 'short') {
      inputHtml =
        '<input type="text" class="input-box" data-q-text="' + q.num + '" placeholder="' + escapeHtml(q.placeholder || '정답을 입력하세요') + '" value="' + escapeHtml(userVal || '') + '" />';
    } else if (q.type === 'essay') {
      const len = String(userVal || '').trim().length;
      inputHtml =
        '<textarea class="textarea-box" data-q-text="' + q.num + '" placeholder="' + escapeHtml(q.placeholder || '') + '">' +
          escapeHtml(userVal || '') +
        '</textarea>' +
        '<div class="char-hint"><span>정성껏 작성한 소감은 문화상품권 선정 시 중요하게 반영됩니다.</span><span id="q20Count">' + len + '자</span></div>';
    }

    const imageHtml = q.image
      ? '<div class="q-photo" data-zoom-src="' + escapeHtml(q.image) + '" data-zoom-title="' + escapeHtml(q.imageAlt || '참고 사진') + '" data-zoom-caption="' + escapeHtml(q.imageAlt || '') + '">' +
          '<img src="' + escapeHtml(q.image) + '" alt="' + escapeHtml(q.imageAlt || '') + '" />' +
        '</div>'
      : '';

    return (
      '<article class="question-card" id="q-' + q.num + '">' +
        '<p class="question-stem"><span class="q-num">' + q.num + '.</span>' + escapeHtml(q.text) + '</p>' +
        imageHtml +
        inputHtml +
        '<div class="q-feedback" id="fb-' + q.num + '" hidden></div>' +
      '</article>'
    );
  }

  function bindWorksheetEvents(ws, wsState) {
    // Route checkboxes
    els.worksheetRoot.querySelectorAll('[data-route]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const num = Number(btn.getAttribute('data-route'));
        const idx = wsState.checkedRoute.indexOf(num);
        if (idx === -1) wsState.checkedRoute.push(num);
        else wsState.checkedRoute.splice(idx, 1);
        btn.classList.toggle('checked');
        btn.querySelector('span').textContent = btn.classList.contains('checked') ? '✓' : '○';
        saveState();
      });
    });

    // Space visit cards
    els.worksheetRoot.querySelectorAll('[data-space-name]').forEach(function (card) {
      function toggle() {
        const name = card.getAttribute('data-space-name');
        const idx = wsState.visitedSpaces.indexOf(name);
        if (idx === -1) wsState.visitedSpaces.push(name);
        else wsState.visitedSpaces.splice(idx, 1);
        card.classList.toggle('visited');
        card.querySelector('.visit-pill').textContent = card.classList.contains('visited') ? '✓ 확인함' : '현장 확인';
        saveState();
      }
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });

    // Photo zoom triggers
    els.worksheetRoot.querySelectorAll('[data-zoom-src]').forEach(function (el) {
      el.addEventListener('click', function () {
        openLightbox(
          el.getAttribute('data-zoom-src'),
          el.getAttribute('data-zoom-title'),
          el.getAttribute('data-zoom-caption')
        );
      });
    });

    // Activity text inputs
    const thinkEl = document.getElementById('activityThinkInput');
    if (thinkEl) {
      thinkEl.addEventListener('input', function () {
        wsState.activityThink = thinkEl.value;
        saveState();
      });
    }

    const pickInput = document.getElementById('selectedPickInput');
    if (pickInput) {
      pickInput.addEventListener('input', function () {
        wsState.selectedPick = pickInput.value;
        els.worksheetRoot.querySelectorAll('[data-pick]').forEach(function (c) {
          c.classList.toggle('selected', c.getAttribute('data-pick') === pickInput.value);
        });
        saveState();
      });
    }

    els.worksheetRoot.querySelectorAll('[data-pick]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const val = chip.getAttribute('data-pick');
        wsState.selectedPick = val;
        if (pickInput) pickInput.value = val;
        els.worksheetRoot.querySelectorAll('[data-pick]').forEach(function (c) {
          c.classList.toggle('selected', c === chip);
        });
        saveState();
      });
    });

    const reasonEl = document.getElementById('reflectionReasonInput');
    if (reasonEl) {
      reasonEl.addEventListener('input', function () {
        wsState.reflectionReason = reasonEl.value;
        saveState();
      });
    }

    // OX & MCQ choice buttons
    els.worksheetRoot.querySelectorAll('[data-q]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const qNum = btn.getAttribute('data-q');
        const val = btn.getAttribute('data-val');
        wsState.answers[qNum] = val;
        const card = document.getElementById('q-' + qNum);
        card.classList.remove('missing');
        card.querySelectorAll('[data-q]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        saveState();
      });
    });

    // Short & Essay text inputs
    els.worksheetRoot.querySelectorAll('[data-q-text]').forEach(function (input) {
      input.addEventListener('input', function () {
        const qNum = input.getAttribute('data-q-text');
        wsState.answers[qNum] = input.value;
        const card = document.getElementById('q-' + qNum);
        card.classList.remove('missing');
        if (qNum === '20') {
          const cnt = document.getElementById('q20Count');
          if (cnt) cnt.textContent = input.value.trim().length + '자';
        }
        saveState();
      });
    });

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleSubmit);
    }
  }

  function applyFeedbackStyles() {
    if (!lastGradedResult || lastGradedResult.wsId !== state.activeTab) return;
    const ws = DATA.worksheets[state.activeTab];
    const details = lastGradedResult.graded.details;

    ws.questions.forEach(function (q) {
      const card = document.getElementById('q-' + q.num);
      const fb = document.getElementById('fb-' + q.num);
      if (!card || !fb) return;

      card.classList.remove('correct', 'wrong', 'missing');
      if (q.type === 'essay') {
        fb.className = 'q-feedback info';
        fb.innerHTML = '<strong>참고 예시:</strong> ' + escapeHtml(q.sampleAnswer || '');
        fb.hidden = false;
        return;
      }

      const d = details[String(q.num)];
      if (!d) return;

      let ansLabel = String(d.correctAnswer);
      if (q.type === 'mcq') {
        const idx = Number(d.correctAnswer) - 1;
        ansLabel = CIRCLED_NUMS[idx] + ' ' + q.options[idx];
      }

      if (d.isCorrect) {
        card.classList.add('correct');
        fb.className = 'q-feedback ok';
        fb.innerHTML = '<strong>정답입니다!</strong> ' + escapeHtml(d.explanation);
      } else {
        card.classList.add('wrong');
        fb.className = 'q-feedback bad';
        fb.innerHTML = '<strong>정답: ' + escapeHtml(ansLabel) + '</strong> — ' + escapeHtml(d.explanation);
      }
      fb.hidden = false;
    });
  }

  function renderResultSection() {
    const wsId = state.activeTab;
    const ws = DATA.worksheets[wsId];
    const wsState = state.worksheets[wsId];

    let certData = null;
    if (lastGradedResult && lastGradedResult.wsId === wsId) {
      certData = lastGradedResult;
    } else if (wsState.submissions.length > 0 && !teacherMode) {
      const latest = wsState.submissions[wsState.submissions.length - 1];
      certData = {
        wsId: wsId,
        graded: { score: latest.score, total: latest.total, accuracy: latest.accuracy },
        attempt: latest.attempt,
        submittedAt: latest.submittedAt,
        studentLabel: latest.studentLabel,
        localPreview: latest.localPreview
      };
    }

    if (!certData) {
      els.resultSection.hidden = true;
      els.resultSection.innerHTML = '';
      return;
    }

    const modeBadge = teacherMode
      ? '교사 모드 채점 확인'
      : certData.localPreview
        ? '미리보기 임시 저장 완료'
        : certData.attempt + '차 제출 완료';

    els.resultSection.hidden = false;
    els.resultSection.innerHTML =
      '<div class="cert-card">' +
        '<span class="cert-badge">' + escapeHtml(modeBadge) + '</span>' +
        '<h2 class="cert-title">' + escapeHtml(ws.shortLabel + ' 확인증 · ' + (certData.studentLabel || '교사 확인')) + '</h2>' +
        '<div class="cert-score-box">' +
          '<div class="cert-stat"><div class="cert-stat-label">맞힌 개수</div><div class="cert-stat-val">' + certData.graded.score + ' / ' + certData.graded.total + '</div></div>' +
          '<div class="cert-stat"><div class="cert-stat-label">정답률</div><div class="cert-stat-val">' + certData.graded.accuracy + '%</div></div>' +
          '<div class="cert-stat"><div class="cert-stat-label">제출 차수</div><div class="cert-stat-val">' + (certData.attempt || 1) + '차</div></div>' +
        '</div>' +
        '<p class="cert-meta">제출 시각: ' + escapeHtml(formatKoreanDateTime(certData.submittedAt)) +
          (certData.localPreview ? ' (구글 시트 연결 전이라 이 브라우저에만 저장되었습니다)' : '') +
        '</p>' +
        '<button type="button" class="btn-secondary" id="scrollTopQuestionsBtn">위에서 문항별 정답·해설 보기 ↑</button>' +
      '</div>';

    const scrollBtn = document.getElementById('scrollTopQuestionsBtn');
    if (scrollBtn) {
      scrollBtn.addEventListener('click', function () {
        const firstQ = document.getElementById('q-1');
        if (firstQ) firstQ.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  async function postWithRetry(url, payload) {
    const delays = [0, 800, 1600];
    let lastError = null;
    for (let i = 0; i < delays.length; i += 1) {
      if (delays[i] > 0) {
        await new Promise(function (resolve) { setTimeout(resolve, delays[i]); });
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json || json.ok === false) {
          throw new Error((json && json.error) || 'SERVER_REJECTED');
        }
        return json;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('SUBMISSION_FAILED');
  }

  function saveDemoSubmission(payload, attempt, serverTime) {
    try {
      const raw = root.localStorage.getItem(DEMO_SUBMISSIONS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({
        submittedAt: serverTime,
        classNo: payload.classNo,
        number: payload.number,
        studentCode: payload.studentCode,
        name: payload.name,
        worksheet: payload.worksheet,
        score: payload.score,
        total: payload.total,
        accuracy: payload.accuracy,
        attempt: attempt,
        wrongItems: payload.wrongItems,
        activityThink: payload.activityThink,
        selectedPick: payload.selectedPick,
        reflectionReason: payload.reflectionReason,
        reflection20: payload.reflection20,
        reflectionLength: payload.reflectionLength,
        answersJson: payload.answersJson
      });
      root.localStorage.setItem(DEMO_SUBMISSIONS_KEY, JSON.stringify(arr));
    } catch (e) {
      // Ignore storage error
    }
  }

  async function handleSubmit() {
    const wsId = state.activeTab;
    const ws = DATA.worksheets[wsId];
    const wsState = state.worksheets[wsId];

    const check = validateSubmission(state.student, wsState, ws, teacherMode);
    if (!check.valid) {
      showToast(check.message, true);
      if (check.missingQ) {
        const qCard = document.getElementById('q-' + check.missingQ);
        if (qCard) qCard.classList.add('missing');
      }
      const target = document.getElementById(check.targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof target.focus === 'function') target.focus({ preventScroll: true });
      }
      return;
    }

    const graded = gradeQuiz(ws, wsState.answers);

    if (teacherMode) {
      lastGradedResult = {
        wsId: wsId,
        graded: graded,
        attempt: 1,
        submittedAt: new Date().toISOString(),
        studentLabel: '교사 미리보기'
      };
      applyFeedbackStyles();
      renderResultSection();
      els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('교사 모드 채점이 완료되었습니다.');
      return;
    }

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '선생님께 전송하는 중…';
    }

    const payload = buildSubmissionPayload(
      state.student,
      wsId,
      wsState,
      ws,
      graded,
      CONFIG.defaultGrade || 1
    );
    const studentLabel = '1학년 ' + payload.classNo + '반 ' + payload.number + '번 ' + payload.name;

    try {
      let attempt = wsState.submissions.length + 1;
      let submittedAt = new Date().toISOString();
      let isLocalPreview = false;

      if (CONFIG.apiUrl) {
        const resp = await postWithRetry(CONFIG.apiUrl, payload);
        attempt = resp.attempt || attempt;
        submittedAt = resp.serverTime || submittedAt;
      } else {
        isLocalPreview = true;
        saveDemoSubmission(payload, attempt, submittedAt);
      }

      wsState.submissions.push({
        attempt: attempt,
        score: graded.score,
        total: graded.total,
        accuracy: graded.accuracy,
        submittedAt: submittedAt,
        studentLabel: studentLabel,
        localPreview: isLocalPreview
      });
      saveState();

      lastGradedResult = {
        wsId: wsId,
        graded: graded,
        attempt: attempt,
        submittedAt: submittedAt,
        studentLabel: studentLabel,
        localPreview: isLocalPreview
      };

      renderTabs();
      renderWorksheet();
      renderResultSection();
      els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast(isLocalPreview ? '미리보기 모드로 채점·임시 저장되었습니다.' : '제출이 완료되었습니다!');
    } catch (err) {
      showToast('전송이 지연되고 있습니다. 네트워크 확인 후 다시 눌러 주세요.', true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = ws.shortLabel + ' 다시 제출 시도하기';
      }
    }
  }

  function init() {
    if (teacherMode && els.teacherModeBar) {
      els.teacherModeBar.hidden = false;
    }
    if (!CONFIG.apiUrl && !teacherMode && els.previewModeBanner) {
      els.previewModeBanner.hidden = false;
    }

    els.studentNumber.addEventListener('input', function () {
      state.student.number = els.studentNumber.value;
      saveState();
    });
    els.studentName.addEventListener('input', function () {
      state.student.name = els.studentName.value;
      saveState();
    });

    els.lightboxClose.addEventListener('click', closeLightbox);
    els.lightbox.addEventListener('click', function (e) {
      if (e.target === els.lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.lightbox.hidden) closeLightbox();
    });

    renderStudentInfo();
    renderTabs();
    renderWorksheet();
    renderResultSection();
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
