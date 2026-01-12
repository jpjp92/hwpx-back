# HWPX AI 스마트 편집기 (해촉증명서)

Gemini AI를 활용하여 HWPX 문서를 분석하고, 데이터를 수정하여 다시 저장할 수 있는 지능형 문서 편집 도구입니다.

## 주요 기능

- **⚡ 고속 모드 (Latency Optimized)**: Gemini 2.5 Flash 모델을 기반으로 최적화된 데이터 추출 및 처리 속도를 제공합니다.
- **HWPX 정밀 분석**: HWPX 파일의 내부 XML 구조를 분석하여 텍스트 데이터를 정밀하게 추출합니다.
- **AI 필드 자동 맵핑**: Gemini 2.5 Flash를 사용하여 해촉증명서의 주요 정보(성명, 주민등록번호, 주소, 용역기간 등)를 자동으로 분류합니다.
- **✨ 다이내믹 사용자 경험 (UX)**:
  - **실시간 진행 상황**: 로딩 중 4단계 실시간 상태 메시지 노출.
  - **시각적 로딩 바**: 분석 진행률을 시각적으로 보여주는 프로그레스 바 제공.
  - **애니메이션 효과**: Fade-in 및 Slide-in 효과를 통한 부드러운 화면 전환.
- **실시간 편집 및 재생성**: 추출된 데이터를 웹 UI에서 바로 수정하고, 원본 서식을 유지한 채 새로운 HWPX 파일로 다운로드할 수 있습니다.

## AI 모델의 역할 (Gemini 2.5 Flash)

본 프로젝트에서 Gemini AI는 비정형 XML 데이터에서 정밀한 정보 추출(Information Extraction)을 수행합니다.

- **비정형 데이터 구조화**: HWPX 내부의 복잡한 XML 텍스트에서 '해촉증명서' 서식에 해당하는 데이터만 선별적으로 추출합니다.
- **주요 필드 자동 맵핑**:
  - **개인 정보**: 신청인 성명, 주민등록번호, 주소지
  - **용역 정보**: 용역 기간, 용역 내용, 용도
  - **발행처 정보**: 업체명, 사업자번호, 업체 주소, 대표자 성명
  - **기타**: 증명서 발급일
- **구조화된 출력**: 추출된 데이터를 전용 JSON 스키마에 맞춰 정확하게 반환하여 프론트엔드 UI와 즉각 연동되도록 합니다.

## **Gemini 2.5 Flash 파싱 및 수정 절차**

이 섹션은 `services/geminiService.ts`에서 사용하는 방식대로 Gemini 2.5 Flash 모델을 통해 HWPX(내부 XML)를 파싱하고, 추출된 데이터를 문서에 반영(수정)하는 구체적 절차를 설명합니다.

- 1) HWPX -> XML 추출
  - HWPX는 ZIP 기반 패키지입니다. 서버에서 `JSZip` 등으로 압축을 풀어 주요 XML(예: document.xml)을 문자열로 읽어옵니다.

- 2) AI에 보낼 입력 구성
  - XML 문자열을 모델 입력에 포함시키되, 크기가 큰 경우 `substring(0, 40000)`처럼 일정 길이로 잘라 보냅니다(현재 구현 참조).
  - 프롬프트는 추출해야 할 필드 리스트와 반환 형식을 명시합니다. 예: 신청인, 주민등록번호, 주소, 용역기간 등.

- 3) 모델 호출 옵션
  - `responseMimeType: "application/json"`으로 요청하여 JSON 응답을 받습니다.
  - `responseSchema`를 통해 스키마(Type.OBJECT, 각 필드의 Type.STRING 등)와 `required` 필드를 지정하여 응답 일관성을 확보합니다.

- 4) 응답 파싱
  - 서비스는 `response.text`를 `JSON.parse()`하여 `HWPXData` 타입으로 변환합니다.
  - 파싱 실패 시 예외를 던지고, 로그에 원인 출력합니다.

- 5) 문서 수정(반영) 흐름
  - 받은 `HWPXData`를 기반으로 원본 XML을 수정합니다. 권장 방법:
    1. `fast-xml-parser` 또는 `xml2js`로 XML을 JS 객체로 변환.
    2. 필요한 노드(예: 신청인 이름, 주소 등)를 찾아 `HWPXData`의 값으로 덮어쓰기.
    3. 객체를 다시 XML로 직렬화하고, 원래 HWPX 내부 경로에 덮어쓰기.
    4. `JSZip`으로 다시 패키징하여 `.hwpx`(또는 .zip)로 제공.

  - 간단한 의사코드 예시:

```ts
// 1. XML -> JS 객체
const parsed = parseXml(documentXml);

// 2. 필드 반영
parsed.document.body.someNode.applicant = hwpxData.applicant;
parsed.document.body.someNode.ssn = hwpxData.ssn;

// 3. JS 객체 -> XML
const newXml = buildXml(parsed);

// 4. 다시 압축하여 HWPX 반환
zip.file('word/document.xml', newXml);
const out = await zip.generateAsync({ type: 'nodebuffer' });

// 전송 혹은 다운로드
```

- 6) 예외 및 유의사항
  - 민감한 개인정보(주민등록번호 등)를 외부 API에 전송할 때는 법적·보안적 검토 필요.
  - 모델이 잘못 추출하는 경우를 대비해 프런트엔드에서 수정 가능한 UI를 제공해야 합니다.
  - 입력 XML을 잘라서 보낼 때(트렁케이션) 모델이 누락된 문맥으로 잘못 추출할 수 있으므로, 가능한 한 관련 블록이 온전하게 포함되도록 슬라이스 경계를 조정하세요.
  - 반환 스키마 불일치 시 로깅과 예외 처리를 통해 디버깅 정보를 확보하세요.

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
├── App.tsx               # 메인 화면, 다이내믹 로딩 및 비즈니스 로직
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
