'use strict';

/**
 * 서대문형무소역사관 현장체험학습 사이트 전역 설정
 * - 기존 학습지 허브(music-class-site)와 완전히 독립적으로 동작합니다.
 * - 구글 시트 Apps Script 웹 앱 배포 후 apiUrl에 '/exec' 주소를 입력하면 실시간 연동됩니다.
 */
window.SEODAEMUN_CONFIG = {
  apiUrl: '',
  siteUrl: 'https://dallalan2277-lab.github.io/seodaemun-fieldtrip/',
  classes: [1, 2, 3, 4, 5, 6, 7],
  giftTarget: 10,
  defaultGrade: 1,
  schoolTitle: '중학교 1학년 현장체험학습',
  eventTitle: '서대문형무소역사관, 그날의 기억을 걷다'
};
