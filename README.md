# HWPX AI 스마트 편집기 (해촉증명서)

Gemini AI를 활용하여 HWPX 문서를 분석하고, 데이터를 수정하여 다시 저장할 수 있는 지능형 문서 편집 도구입니다.

## 🚀 주요 기능

- **HWPX 정밀 분석**: HWPX 파일의 구조를 분석하여 XML 세션에서 텍스트 데이터를 추출합니다.
- **AI 필드 추출**: Gemini 2.5 Flash를 사용하여 해촉증명서의 주요 정보(성명, 주민등록번호, 주소, 용역기간 등)를 자동으로 분류합니다.
- **실시간 편집**: 추출된 데이터를 웹 UI에서 바로 수정하고 변경 사항을 실시간으로 미리 확인할 수 있습니다.
- **HWPX 재생성**: 수정된 데이터를 바탕으로 원본 서식을 유지한 채 새로운 HWPX 파일을 생성하여 다운로드할 수 있습니다.

## 🤖 AI 모델의 역할 (Gemini 2.5 Flash)

본 프로젝트에서 Gemini AI는 비정형 XML 데이터에서 정밀한 정보 추출(Information Extraction)을 수행합니다.

- **비정형 데이터 구조화**: HWPX 내부의 복잡한 XML 텍스트에서 '해촉증명서' 서식에 해당하는 데이터만 선별적으로 추출합니다.
- **주요 필드 자동 맵핑**:
  - **개인 정보**: 신청인 성명, 주민등록번호, 주소지
  - **용역 정보**: 용역 기간, 용역 내용, 용도
  - **발행처 정보**: 업체명, 사업자번호, 업체 주소, 대표자 성명
  - **기타**: 증명서 발급일
- **구조화된 출력**: 추출된 데이터를 개발자가 정의한 JSON 스키마에 맞춰 정확하게 반환하여 프론트엔드 UI와 즉각 연동되도록 합니다.

## 🛠 기술 스택

- **Frontend**: React (Vite), Tailwind CSS
- **AI**: Google Gemini 2.5 Flash (Google GenAI SDK)
- **Library**: JSZip (파일 압축/해제), Lucide-React (아이콘)
- **Language**: TypeScript

## 📂 프로젝트 구조

```text
hwpx-back/
├── services/
│   └── geminiService.ts  # Gemini API를 이용한 데이터 파싱 로직
├── App.tsx               # 메인 애플리케이션 화면 및 비즈니스 로직
├── types.ts              # 데이터 모델 및 타입 정의
├── index.tsx             # 진입점 (Entry point)
├── vite.config.ts        # Vite 설정 및 환경 변수 주입
└── README.md             # 프로젝트 문서
```

## ⚙️ 시작하기

### 1. 요구 사항

- Node.js (Latest LTS)
- Google Gemini API Key

### 2. 설치 및 실행

```bash
# 의존성 설치
npm install

# .env.local 설정
# GEMINI_API_KEY=YOUR_API_KEY_HERE

# 로컬 개발 서버 실행
npm run dev
```

## ⚠️ 참고 사항

- 본 도구는 표준 HWPX 파일만 지원하며, 구형 바이너리 (.hwp) 파일은 지원하지 않습니다.
