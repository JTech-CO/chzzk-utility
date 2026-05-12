# Chzzk Utility

> **치지직(Chzzk) 라이브/다시보기의 광고 제거, 최고 화질 고정, 타임머신 되감기를 지원하는 Chrome 확장프로그램입니다.**

## 1. 소개 (Introduction)

이 프로젝트는 네이버 치지직(Chzzk) 시청 환경을 개선하기 위해 개발된 비공식 확장프로그램입니다.
Declarative Net Request 정적 룰과 fetch/XHR 응답 변조를 결합한 2계층 광고 차단 구조를 사용하며, 추가적으로 DOM 기반 팝업/배너 제거, 최고 화질 강제 고정, 라이브 타임머신 되감기 컨트롤을 제공합니다.

**주요 기능**
- **광고 숨김**: 라이브/VOD 재생 전·중간 광고 및 화면 배너 광고를 클라이언트 측에서 숨김 처리
- **팝업 비활성화**: 광고 차단 감지 팝업, 비정상 접근 경고 팝업 자동 닫기
- **최고 화질 고정**: 항상 최고 화질을 자동 선택
- **타임머신 되감기**: 라이브 타임머신 강제 활성화 + 되감기 컨트롤(-30s -5s Pause/Play +5s +30s + LIVE)

**기능별 작동 메커니즘 요약**
| 기능 | 작동 계층 | 기술 방식 |
|------|----------|----------|
| 광고 네트워크 차단 | Background (DNR) | `declarativeNetRequest` 정적 룰셋으로 광고 도메인 요청 차단 |
| API 광고 데이터 제거 | Main World (inject.js) | `fetch`/`XHR` 후킹 → 응답 JSON에서 광고 필드 삭제 후 재구성 |
| 타임머신 강제 활성화 | Main World (inject.js) | `live-detail` API 응답의 `timeMachineActive` 값을 `true`로 변조 |
| 팝업/배너 제거 | Isolated World (content.js) | `MutationObserver` + CSS 셀렉터 기반 DOM 요소 탐지 및 숨김 |
| 최고 화질 고정 | Dual World | `localStorage` 후킹(Main World) + 화질 메뉴 자동 클릭(Isolated World) |
| 되감기 컨트롤 | Isolated World (content.js) | `HTMLMediaElement.currentTime`/`seekable` API를 이용한 UI 삽입 |
| 라이브 강제 복귀 | Isolated World (content.js) | `sessionStorage` 기반 라이브 세션 추적 → 이탈 시 `location.replace` |
| 라이브 이탈 방지 | Main World (inject.js) | `History.pushState`/`replaceState`, `Location.assign`/`replace` 후킹 |

## 2. 기술 스택 (Tech Stack)

- **Platform**: Chrome Extension (Manifest V3)
- **Language**: Vanilla JavaScript
- **Network Blocking**: Declarative Net Request (정적 룰셋 차단)
- **API Hooking**: `window.fetch` / `XMLHttpRequest` 프로토타입 후킹
- **DOM Manipulation**: MutationObserver, CSS Selector Querying
- **Storage**: `chrome.storage.local` (설정 동기화), `localStorage` 후킹 (화질)

## 3. 기술 아키텍처 (Architecture)

```
Isolated World (content.js)                Main World (inject.js)               Background (background.js)
┌─────────────────────────────┐           ┌───────────────────────────┐        ┌──────────────────────────┐
│ 부트스트랩 (설정 로드)        │           │ fetch/XHR 프로토타입 후킹   │        │ onInstalled 초기화       │
│ inject.js 주입 (Main World) │──inject──▶│ API 응답 JSON 변조         │        │ chrome.storage 감시      │
│ MutationObserver 시작       │           │  - 광고 필드 pruning       │        │ declarativeNetRequest    │
│ 팝업/배너 제거 (DOM 순회)    │           │  - 타임머신 활성화         │        │  룰셋 토글 (enable/off)  │
│ 최고 화질 메뉴 자동 클릭     │           │ localStorage 후킹          │        └──────────────────────────┘
│ 되감기 컨트롤 바 삽입        │◀─message─│  (화질 키 항상 'best')      │                    │
│ 라이브 강제 복귀 (세션 추적)  │           │ History/Location 후킹      │                    │
│ SPA 라우팅 감시 (URL 변경)   │           │  (라이브 이탈 방지)         │          ┌────────┴────────┐
└─────────────────────────────┘           └───────────────────────────┘          │ rules.json (DNR) │
                                                                                │ 7개 정적 차단 룰  │
                                                                                └─────────────────┘
```

Content Script(`content.js`)가 Isolated World에서 실행되는 이유는 Chrome Extension의 보안 모델에 의해 `chrome.*` API에 접근하기 위함입니다. 반면 `inject.js`는 `<script>` 태그 동적 삽입 방식으로 Main World에 주입되어 페이지 원본의 `fetch`, `XHR`, `localStorage`, `History` 프로토타입을 직접 후킹할 수 있습니다.

### Dual-World 실행 모델
```
chrome.storage.local ──▶ content.js (Isolated) ──postMessage──▶ inject.js (Main World)
        │                       │                                      │
        │                 DOM 조작 (팝업 제거,                    fetch/XHR 후킹
        │                  컨트롤 바, 배너)                     localStorage 후킹
        │                                                      History/Location 후킹
        ▼
  background.js ──▶ declarativeNetRequest 룰셋 토글
```

설정은 `chrome.storage.local`에 저장되며, `content.js`가 변경을 수신한 뒤 `window.postMessage`를 통해 Main World의 `inject.js`로 전달합니다. Background에서는 `blockAds` 토글에 따라 DNR 룰셋을 동적으로 활성화/비활성화합니다.

### 광고 차단 2계층 구조

**Layer 1 — Declarative Net Request (네트워크 레벨)**

브라우저 네트워크 스택에서 광고 관련 HTTP 요청을 사전 차단합니다.

| Rule ID | 차단 대상 | URL 패턴 | 차단 리소스 타입 |
|---------|----------|----------|----------------|
| 1 | Naver 광고 클릭 추적 | `ssl.pstatic.net/static/nng/aclk/` | xhr, image, media, sub_frame |
| 2 | Naver VETA 광고 SDK | `siape.veta.naver.com/` | xhr, image, media, sub_frame, ping |
| 3 | Naver VETA 광고 서버 | `veta.naver.com/` | xhr, media, sub_frame, ping |
| 4 | Naver 로그 수집기 | `cc.naver.com/cc` | xhr, image, ping |
| 5 | Naver 웹 분석 스크립트 | `naver.com/wcslog.js` | script |
| 6 | 일반 광고 경로 | `/ad/` (chzzk 출처) | xhr, media |
| 7 | 광고 게이트웨이 | `ad.gateway` (chzzk 출처) | xhr |

**Layer 2 — API 응답 변조 (애플리케이션 레벨)**

네트워크 차단을 우회하여 이미 도달한 API 응답 JSON에서 광고 데이터 필드를 재귀적으로 제거합니다.

```
Chzzk API 응답 (JSON)
    │
    ▼
fetch/XHR 후킹 (inject.js)
    │
    ├── URL이 api.chzzk.naver.com/(service|polling)/ 패턴에 매칭?
    │      No → 원본 응답 반환
    │      Yes ▼
    ├── pruneAdFields(): 재귀 탐색 (depth ≤ 6)
    │   삭제 대상 필드:
    │     playerAdDisplayResponse, preplayResponse,
    │     midrollAdResponse, displayAdResponse,
    │     adResponse, adInfo, adProductId
    │   + 중첩 JSON 문자열 내부까지 파싱하여 탐색
    │
    └── 변조된 JSON → new Response() 또는 responseText 재정의
```

### 타임머신 활성화 플로우
```
live-detail API 응답 수신
    │
    ├── content.timeMachineActive = true (강제 설정)
    └── content.livePlaybackJson 내부
            └── live.timeMachine = true (강제 설정)
```

### 팝업 탐지 전략

9개의 CSS 셀렉터(`[role="dialog"]`, `[class*="modal" i]` 등)로 후보 요소를 수집한 뒤, 텍스트 본문에서 차단 대상 문구('광고 차단', '비정상적 접근', '다른 브라우저를 이용해주세요' 등 8종)의 포함 여부를 검사합니다. 텍스트 길이가 600자를 초과하는 요소는 오탐 방지를 위해 제외됩니다. 추가로, `fixed`/`absolute` 포지션 + `z-index ≥ 100`인 `div` 요소도 인라인 모달로서 보조 탐색됩니다.

## 4. 설치 및 실행 (Quick Start)

**요구 사항**: Chrome, Edge, Whale 등 Chromium 기반 브라우저

1. **다운로드**
   - 이 저장소를 다운로드하거나 `git clone` 후 압축을 해제합니다.

2. **확장 프로그램 페이지 접속**
   ```
   chrome://extensions (Chrome)
   edge://extensions   (Edge)
   whale://extensions  (Whale)
   ```

3. **로드**
   - 우상단 **"개발자 모드"** 켜기
   - **"압축해제된 확장 프로그램을 로드합니다"** 클릭 후 이 폴더 선택

## 5. 폴더 구조 (Structure)

```text
chzzk-utility/
├── manifest.json      # MV3 매니페스트 — 권한, 호스트, 스크립트 연결 설정
├── background.js      # Service Worker — 설정 초기화 및 DNR 룰셋 동적 토글
├── rules.json         # declarativeNetRequest 정적 룰 7개 (광고 도메인 차단)
├── content.js         # Isolated World — DOM 팝업/배너 제거, 화질 메뉴, 되감기 컨트롤, 라이브 복귀
├── inject.js          # Main World — fetch/XHR/localStorage/History 프로토타입 후킹
├── controls.css       # 되감기 컨트롤 바 스타일시트
├── popup.html         # 확장 프로그램 설정 팝업 UI (7개 토글 스위치)
├── popup.js           # 설정 팝업 로직 — chrome.storage.local 읽기/쓰기
├── popup.css          # 설정 팝업 스타일시트
└── icons/             # 확장 프로그램 아이콘 (16/48/128 PNG)
```

## 6. 스트리머 수익 안내

본 확장 프로그램의 광고 숨김 기능은 광고 송출 자체를 서버에서 차단하는 것이 아니라, 이미 전달된 광고 데이터를 사용자의 브라우저 화면에서 숨기는 방식으로 동작합니다.
따라서 **광고 노출 집계는 정상적으로 이루어지며, 스트리머의 광고 수익이 감소하는 문제는 발생하지 않습니다.**

## 7. 정보 (Info)

- **License**: MIT
- **Version**: 2.2.0
- **Privacy-policy**: [개인정보 처리방침 안내](<https://jtech-co.github.io/chzzk-utility/privacy-policy.html>)
