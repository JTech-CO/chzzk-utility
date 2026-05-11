# Chzzk Utility

> **치지직(Chzzk) 라이브/다시보기의 광고 제거, 최고 화질 고정, 타임머신 되감기를 지원하는 확장프로그램**

## 1. 소개

이 프로젝트는 네이버 치지직 시청 환경을 개선하기 위해 개발된 확장프로그램 입니다.
API 응답 변조와 네트워크 룰을 활용하여 광고를 사용자 화면에서 숨기고, 쾌적한 시청 경험을 제공합니다.

**주요 기능**
- **광고 숨김**: 라이브/VOD 재생 전·중간 광고 및 화면 배너 광고를 클라이언트 측에서 숨김 처리
- **팝업 비활성화**: 광고 차단 감지 팝업, 비정상 접근 경고 팝업 자동 닫기
- **최고 화질 고정**: 항상 최고 화질을 자동 선택
- **타임머신 되감기**: 라이브 타임머신 강제 활성화 + 되감기 컨트롤(-30s -5s ⏯ +5s +30s + LIVE)

## 2. 기술 스택

- **Platform**: Chrome Extension (Manifest V3)
- **Language**: Vanilla JavaScript
- **Network**: Declarative Net Request (정적 룰 차단)
- **Injection**: fetch/XHR 후킹을 통한 API 응답 변조

## 3. 설치 및 실행

**요구 사항**: Chrome, Edge, Whale 등 Chromium 기반 브라우저

1. **다운로드**
   ```
   이 폴더 전체를 다운로드하거나 압축 해제합니다.
   ```

2. **확장 프로그램 페이지 접속**
   ```
   chrome://extensions (Chrome)
   edge://extensions   (Edge)
   whale://extensions  (Whale)
   ```

3. **로드**
   - 우상단 **"개발자 모드"** 켜기
   - **"압축해제된 확장 프로그램을 로드합니다"** 클릭 후 이 폴더 선택

## 4. 폴더 구조

```text
chzzk-cheatkey/
├── manifest.json      # MV3 매니페스트
├── background.js      # 서비스 워커 (룰셋 토글)
├── rules.json         # declarativeNetRequest 정적 룰
├── content.js         # DOM/팝업/배너/컨트롤 바 (Isolated World)
├── inject.js          # fetch/XHR 후킹 (Main World)
├── controls.css       # 되감기 컨트롤 바 스타일
├── popup.html         # 설정 팝업 UI
├── popup.js           # 설정 팝업 로직
├── popup.css          # 설정 팝업 스타일
└── icons/             # 아이콘 (16/48/128 PNG)
```

## 5. 스트리머 수익 안내

본 확장 프로그램의 광고 숨김 기능은 광고 송출 자체를 서버에서 차단하는 것이 아니라, 이미 전달된 광고 데이터를 사용자의 브라우저 화면에서 숨기는 방식으로 동작합니다.
따라서 **광고 노출 집계는 정상적으로 이루어지며, 스트리머의 광고 수익이 감소하는 문제는 발생하지 않습니다.**

## 6. 정보

- **License**: MIT
- **Version**: 2.1.1