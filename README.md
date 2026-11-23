# 서대문형무소역사관 현장체험학습 모바일 활동지 & 1~7반 교사 대시보드

기존 `학습지 허브`와 완전히 분리된 중학교 1학년 서대문형무소역사관 현장체험학습 전용 웹 앱입니다.

## 주요 주소 (GitHub Pages)
- **학생용 모바일 활동지·퀴즈:** `https://dallalan2277-lab.github.io/seodaemun-fieldtrip/`
- **교사용 미리보기 (정답·해설 즉시 확인):** `https://dallalan2277-lab.github.io/seodaemun-fieldtrip/?교사`
- **1~7반 공동 교사 대시보드:** `https://dallalan2277-lab.github.io/seodaemun-fieldtrip/teacher.html`
  - 특정 반 바로 열기: `teacher.html?class=1` ~ `teacher.html?class=7`
- **현장 인쇄용 QR 포스터:** `https://dallalan2277-lab.github.io/seodaemun-fieldtrip/qr.html`

## 구성 기능
1. **학생용 모바일 사이트 (`index.html`, `data.js`, `app.js`)**
   - **활동지 ① 기본형** (20문항) + **활동지 ② 리플릿 심화형** (현장 사진 4장 · 추천 관람 동선 체크 · 주요 연표 · 변형 20문항) 모두 탑재
   - 1~7반 버튼 선택, 번호·이름·답안·소감 실시간 `localStorage` 자동 저장
   - 제출 즉시 **채점 · 정답률 · 제출 확인증 · 문항별 해설** 제공
2. **1~7반 공동 교사 대시보드 (`teacher.html`, `teacher.js`)**
   - `전체 현황 (1~7반)` 및 `1반`~`7반` 개별 탭 분리 조회
   - 기본 **정답률 높은 순** 정렬(동점 시 소감 길이·제출 시각 순), 활동지별 필터, 키워드 검색
   - **표 보기 / 소감문 모아보기(카드형)** 전환
   - **반별 소감문 다운로드**: 엑셀용 CSV (`UTF-8 BOM`) + A4 인쇄/한글 복사용 HTML 문서
   - **반별 10명 문화상품권 선정**: 직접 체크 + **조건부 / 동점자 랜덤 추첨**(최소 정답률·최소 소감 글자 수 기준) + 반별 독립 서버 저장
3. **독립 구글 시트 백엔드 (`apps-script/Code.gs`)**
   - 자세한 연동 방법은 [설치방법.md](설치방법.md)를 참고하세요.
