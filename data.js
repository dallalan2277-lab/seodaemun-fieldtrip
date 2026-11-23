'use strict';

/**
 * 서대문형무소역사관 현장체험학습 단일 통합 활동지 (리플릿 심화형) 데이터
 * - 모바일 현장에서 읽기 편하도록 본문·캡션·연표를 핵심 요약형으로 구성했습니다.
 * - 역사 퀴즈 20문항의 문항·선지·정답·해설은 PDF (2) 원문을 유지합니다.
 */
(function (root) {
  const LEAFLET_WORKSHEET = {
    id: 'leaflet',
    shortLabel: '현장체험 활동지',
    tabTitle: '서대문형무소역사관 리플릿 탐구 활동지',
    subtitle: '중학교 1학년 현장체험학습 · 리플릿 탐구',
    title: '서대문형무소역사관, 그날의 기억을 걷다',
    quizTitle: '서대문형무소역사관 탐구 퀴즈',
    quizSubtitle: '확인 학습 · 20문항',
    routeTitle: '추천 관람 동선 (9코스)',
    routeSteps: [
      { num: 1, label: '보안과청사' },
      { num: 2, label: '중앙사' },
      { num: 3, label: '10·11·12옥사' },
      { num: 4, label: '격벽장' },
      { num: 5, label: '공작사' },
      { num: 6, label: '한센병사' },
      { num: 7, label: '추모비' },
      { num: 8, label: '사형장·시구문' },
      { num: 9, label: '여옥사' }
    ],
    introTitle: '1. 역사와 현장 사진',
    introParagraphs: [
      '1908년 ‘경성감옥’으로 개소해 1912년 ‘서대문감옥’, 1923년 ‘서대문형무소’로 바뀌었습니다.',
      '3·1운동·의열 투쟁·학생 독립운동 애국지사들이 옥고를 치렀으며, 1998년 서대문형무소역사관으로 개관했습니다.'
    ],
    photos: [
      {
        id: 'corridor-door',
        src: 'assets/photos/corridor-door.jpg',
        title: '옥사 복도와 감방 출입문',
        caption: '붉은 벽돌 창과 두꺼운 나무문·감시용 시찰구'
      },
      {
        id: 'central-panopticon',
        src: 'assets/photos/central-panopticon.jpg',
        title: '중앙사 옥사 복도',
        caption: '중앙 감시소에서 복도를 한눈에 보는 부채꼴(파놉티콘) 구조'
      },
      {
        id: 'gyeokbyeokjang',
        src: 'assets/photos/gyeokbyeokjang.jpg',
        title: '격벽장(운동장)',
        caption: '수감자 간 대화·눈빛 교환을 막은 부채꼴 칸막이'
      },
      {
        id: 'execution-poplar',
        src: 'assets/photos/execution-poplar.jpg',
        title: '사형장과 통곡의 미루나무',
        caption: '애국지사가 순국한 사형장과 마지막으로 붙잡고 울었다던 미루나무 터'
      }
    ],
    activityPromptTitle: '[활동 1] 부채꼴 설계의 이유',
    activityPromptText: '사진을 보고, 일제가 감옥과 격벽장을 부채꼴로 지은 이유와 통제 방식을 적어 보세요.',
    activityPlaceholder: '여기에 내 생각을 적어 보세요.',
    timelineTitle: '주요 연표',
    timeline: [
      { year: '1908년', event: '‘경성감옥’ 개소' },
      { year: '1919년', event: '3·1운동 수감' },
      { year: '1923년', event: '‘서대문형무소’ 개칭' },
      { year: '1945년', event: '8·15 광복·출옥' },
      { year: '1998년', event: '역사관 정식 개관' }
    ],
    spacesTitle: '2. 주요 연표 & 핵심 공간',
    spacesLead: '관람하며 확인한 공간은 눌러서 표시해 보세요.',
    spaces: [
      { name: '보안과청사 · 지하 고문실', meaning: '수형기록표 전시 및 벽관·물고문 등 가혹 행위가 자행된 곳' },
      { name: '중앙사 및 옥사', meaning: '중앙 감시소를 중심으로 뻗은 부채꼴 감시·수감 공간' },
      { name: '격벽장', meaning: '운동 시간에도 대화·연락을 막으려 칸을 나눈 부채꼴 운동장' },
      { name: '공작사 · 한센병사', meaning: '강제 노역 작업장(공작사)과 한센병 수감자 격리 옥사' },
      { name: '사형장 · 시구문 · 미루나무', meaning: '사형 집행 장소, 시신 반출 비밀 통로(시구문), 통곡의 미루나무' },
      { name: '여옥사(유관순 지하감옥)', meaning: '유관순 열사 등 여성 독립운동가가 수감·순국한 현장' }
    ],
    figuresTitle: '3. 기억할 인물 & 나만의 기록',
    figures: [
      {
        name: '유관순 열사',
        years: '1902~1920',
        desc: '아우내 장터 만세운동을 이끌다 여옥사에 수감되어 옥중 만세운동 끝 순국'
      },
      {
        name: '한용운 선사',
        years: '1879~1944',
        desc: '민족대표 33인으로 투옥되어 옥중에서 『조선독립의 서』 집필'
      },
      {
        name: '안창호 선생',
        years: '1878~1938',
        desc: '신민회·흥사단 조직 후 수차례 옥고를 치르다 수감 중 얻은 병으로 순국'
      },
      {
        name: '강우규 의사',
        years: '1855~1920',
        desc: '65세에 서울역 앞에서 총독에게 폭탄을 투척한 뒤 서대문형무소에서 순국'
      }
    ],
    reflectionTitle: '[활동 2] 나만의 기록',
    reflectionGuide: '가장 기억에 남는 공간·인물 하나를 고르고, 이유와 다짐을 적어 보세요.',
    reflectionPickLabel: '선택한 공간 / 인물',
    reflectionReasonLabel: '마음에 남은 이유',
    reflectionReasonPlaceholder: '여기에 적어 보세요.',
    quickPicks: [
      '보안과청사·고문실',
      '중앙사·옥사',
      '격벽장',
      '공작사·한센병사',
      '사형장·시구문',
      '여옥사',
      '유관순 열사',
      '한용운 선사',
      '안창호 선생',
      '강우규 의사'
    ],
    questions: [
      {
        num: 1, part: 1, type: 'ox',
        text: '서대문형무소는 1908년 개소 당시 ‘서대문교도소’라는 이름으로 처음 문을 열었다.',
        answer: 'X',
        explanation: '1908년 개소 당시 이름은 ‘경성감옥’입니다.'
      },
      {
        num: 2, part: 1, type: 'ox',
        text: '일제강점기 서대문형무소에는 3·1운동, 의열 투쟁, 학생 독립운동 등에 참여한 많은 애국지사가 수감되었다.',
        answer: 'O',
        explanation: '많은 항일 독립운동가들이 이곳에 투옥되었습니다.'
      },
      {
        num: 3, part: 1, type: 'ox',
        text: '중앙사와 옥사는 중앙 감시소에서 여러 복도를 한눈에 감시할 수 있도록 부채꼴 구조로 지어졌다.',
        answer: 'O',
        explanation: '중앙사 중심의 방사형(부채꼴) 감시 구조입니다.'
      },
      {
        num: 4, part: 1, type: 'ox',
        text: '격벽장은 수감자들이 함께 모여 자유롭게 토론하며 운동하도록 만든 넓은 광장이다.',
        answer: 'X',
        explanation: '격벽장은 수감자 간 소통과 눈빛 교환을 막기 위해 부채꼴 칸막이를 세운 운동 시설입니다.'
      },
      {
        num: 5, part: 1, type: 'ox',
        text: '보안과청사 지하에는 독립운동가들에게 물고문·벽관 고문 등 가혹 행위를 가하던 고문실이 있었다.',
        answer: 'O',
        explanation: '보안과청사 지하 고문실에서 벽관·물고문 등 가혹 행위가 자행되었습니다.'
      },
      {
        num: 6, part: 1, type: 'ox',
        text: '사형장 옆 ‘시구문’은 순국한 수감자들의 시신을 감옥 밖으로 몰래 내보내기 위해 만든 비밀 통로였다.',
        answer: 'O',
        explanation: '시신을 비밀리에 반출하던 통로가 시구문입니다.'
      },
      {
        num: 7, part: 1, type: 'ox',
        text: '사형장 앞뜰에 있던 ‘통곡의 미루나무’는 사형장으로 끌려가던 애국지사들이 조국 독립을 못 본 한을 품고 붙잡고 울었다는 나무다.',
        answer: 'O',
        explanation: '사형장 앞 통곡의 미루나무에는 순국 전 애국지사들의 애환이 담겨 있습니다.'
      },
      {
        num: 8, part: 1, type: 'ox',
        text: '유관순 열사는 서대문형무소 여옥사에 수감된 뒤 일제의 감시가 무서워 만세운동을 포기하였다.',
        answer: 'X',
        explanation: '유관순 열사는 옥중에서도 만세운동을 멈추지 않고 이어갔습니다.'
      },
      {
        num: 9, part: 1, type: 'ox',
        text: '강우규 의사는 65세의 나이에 서울역 앞에서 조선 총독을 향해 폭탄을 투척한 뒤 서대문형무소에서 순국하셨다.',
        answer: 'O',
        explanation: '강우규 의사의 서울역 의거와 서대문형무소 순국 사실입니다.'
      },
      {
        num: 10, part: 1, type: 'ox',
        text: '서대문형무소역사관은 오늘날 우리에게 자주독립의 정신과 인권·평화의 소중함을 일깨워 주는 역사 교육의 현장이다.',
        answer: 'O',
        explanation: '역사적 교훈과 평화·인권 교육의 현장입니다.'
      },
      {
        num: 11, part: 2, type: 'mcq',
        text: '서대문형무소의 명칭 변천 순서로 알맞은 것은 무엇인가요?',
        options: [
          '서대문감옥 → 경성감옥 → 서대문형무소',
          '경성감옥 → 서대문감옥 → 서대문형무소',
          '한성감옥 → 마포형무소 → 서대문형무소',
          '서대문구치소 → 경성감옥 → 서대문형무소'
        ],
        answer: 2,
        explanation: '경성감옥(1908) → 서대문감옥(1912) → 서대문형무소(1923) 순으로 명칭이 바뀌었습니다.'
      },
      {
        num: 12, part: 2, type: 'mcq',
        text: '아래 사진처럼 부채꼴 모양으로 높은 벽을 세워 수감자들이 운동할 때도 서로 대화하거나 눈빛을 나누지 못하게 만든 시설은?',
        image: 'assets/photos/gyeokbyeokjang.jpg',
        imageAlt: '부채꼴 모양으로 높은 붉은 벽돌 벽이 세워진 격벽장 사진',
        options: ['공작사', '중앙사', '격벽장', '보안과청사'],
        answer: 3,
        explanation: '부채꼴 칸막이 운동 시설은 ‘격벽장’입니다.'
      },
      {
        num: 13, part: 2, type: 'mcq',
        text: '수감자들에게 강제 노역을 시키기 위해 운영되었던 작업장 건물의 이름은 무엇인가요?',
        options: ['공작사', '여옥사', '추모비', '시구문'],
        answer: 1,
        explanation: '수감자들에게 강제 노역을 시키던 작업장 건물은 ‘공작사’입니다.'
      },
      {
        num: 14, part: 2, type: 'mcq',
        text: '일제가 중앙사와 옥사를 부채꼴(파놉티콘) 구조로 건축한 가장 큰 까닭은 무엇인가요?',
        options: [
          '수감자들에게 햇빛이 잘 드는 넓은 방을 주기 위해',
          '적은 수의 간수로도 많은 수감자를 효율적으로 감시하기 위해',
          '감옥 내부에서 대규모 체육 대회를 열기 위해',
          '조선 전통 궁궐의 건축 양식을 본뜨기 위해'
        ],
        answer: 2,
        explanation: '적은 인원으로도 여러 복도를 한눈에 감시·통제하기 위한 부채꼴 설계입니다.'
      },
      {
        num: 15, part: 2, type: 'short',
        text: '일제가 체포된 독립운동가들의 이름, 나이, 본적, 죄명, 사진 등을 기록해 관리하던 카드를 무엇이라 하나요? (힌트: ㅅㅎㄱㄹㅍ)',
        placeholder: '정답을 입력하세요',
        answer: '수형기록표',
        explanation: '일제가 작성해 수감자들을 관리하던 신상 카드는 ‘수형기록표’입니다.'
      },
      {
        num: 16, part: 2, type: 'mcq',
        text: '민족대표 33인으로 3·1운동에 참여해 서대문형무소에 수감되었으며, 옥중에서도 『조선독립의 서』를 집필해 독립 의지를 굽히지 않은 인물은?',
        options: ['안중근', '윤봉길', '한용운', '김좌진'],
        answer: 3,
        explanation: '한용운 선사는 옥중에서 『조선독립의 서』를 집필하셨습니다.'
      },
      {
        num: 17, part: 2, type: 'mcq',
        text: '신민회와 흥사단을 조직해 민족의 실력 양성에 힘썼으며, 서대문형무소 수감 중 건강이 악화되어 순국하신 독립운동가는?',
        options: ['안창호 선생', '이봉창 의사', '홍범도 장군', '유관순 열사'],
        answer: 1,
        explanation: '안창호 선생은 신민회·흥사단을 조직해 민족 실력 양성에 헌신하셨습니다.'
      },
      {
        num: 18, part: 2, type: 'mcq',
        text: '서대문형무소역사관 현장체험학습을 할 때 지켜야 할 관람 예절로 가장 알맞은 것은?',
        options: [
          '감방 철창을 흔들거나 벽돌에 낙서를 남긴다',
          '순국선열을 추모하는 엄숙한 마음으로 질서를 지키며 관람한다',
          '친구들과 뛰어가며 큰소리로 장난을 친다',
          '출입 금지 안내판이 있는 구역에 몰래 들어간다'
        ],
        answer: 2,
        explanation: '순국선열을 추모하는 마음과 질서를 지키는 관람 태도가 필요합니다.'
      },
      {
        num: 19, part: 2, type: 'mcq',
        text: '서대문형무소가 1998년 ‘역사관’으로 개관하여 보존되고 있는 까닭으로 가장 알맞은 것은?',
        options: [
          '일제의 식민 통치 기술을 홍보하기 위해',
          '항일 독립운동의 역사를 기억하고 자유와 인권의 가치를 배우기 위해',
          '실제 교도소로 다시 사용하기 위해',
          '일반 주택 단지로 개발하기 위해'
        ],
        answer: 2,
        explanation: '독립정신을 계승하고 자유·인권의 가치를 배우는 교육의 장입니다.'
      },
      {
        num: 20, part: 2, type: 'essay',
        text: '오늘날 우리가 누리는 자유와 평화를 위해 희생하신 독립운동가분들께 전하고 싶은 감사 편지나 다짐을 2줄 이상 적어 보세요.',
        placeholder: '여기에 자유롭게 적어 보세요.',
        sampleAnswer: '',
        minLength: 10
      }
    ]
  };

  root.SEODAEMUN_DATA = {
    worksheet: LEAFLET_WORKSHEET,
    worksheets: {
      leaflet: LEAFLET_WORKSHEET
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
