// =====================================================================
// Hospital.gs — 관리 > 병원 관리 서버 함수
//
// 대상 시트: 01_병원 (6열)
//   0 병원ID / 1 병원명 / 2 병원코드 / 3 사용여부 / 4 등록일시 / 5 수정일시
//
// 원칙
// - 모든 함수는 첫 인자로 세션 토큰을 받는다.
// - 조회·수정 범위는 세션 병원 1건으로 한정한다.
// - 수정 가능 항목은 병원명 / 병원코드 2개뿐이다.
// - 병원ID·사용여부·등록일시는 클라이언트가 보내도 무시한다.
// - 신규 등록 / 삭제 / 사용여부 변경 함수는 두지 않는다.
//   (병원 사용여부를 끄면 해당 병원 전 직원이 로그인 불가 → 시트에서만 관리)
// - 병원코드는 식별자 용도이므로 전체 병원 대상 중복 불가.
// =====================================================================


// 시트명
const HOSPITAL_시트명_ = '01_병원';

// 병원코드 형식: 영문 대문자 + 숫자 2~10자
const HOSPITAL_코드형식_ = /^[A-Z0-9]{2,10}$/;


// =====================================================================
// 세션 확인
// =====================================================================

function HOSPITAL_세션_(token) {

  const session = AUTH_getSession(token);

  if (!session || !session['병원ID']) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  return session;
}


// =====================================================================
// 사용여부 불린 변환
// =====================================================================

function HOSPITAL_불린_(값) {

  if (값 === true) {
    return true;
  }

  if (값 === false) {
    return false;
  }

  const s = String(값 == null ? '' : 값).trim().toLowerCase();

  if (s === 'false' || s === '' || s === '0' || s === '미사용') {
    return false;
  }

  return true;
}


// =====================================================================
// 시트 가져오기
// =====================================================================

function HOSPITAL_시트_() {

  const sheet = SpreadsheetApp
    .openById(DB_SPREADSHEET_ID)
    .getSheetByName(HOSPITAL_시트명_);

  if (!sheet) {
    throw new Error(HOSPITAL_시트명_ + ' 시트를 찾을 수 없습니다.');
  }

  return sheet;
}


// =====================================================================
// 전체 행 읽기 (헤더 제외)
// =====================================================================

function HOSPITAL_전체행_(sheet) {

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, 6)
    .getValues();
}


// =====================================================================
// 일시 표시용 문자열 변환
// =====================================================================

function HOSPITAL_일시문자열_(값) {

  if (!값) {
    return '';
  }

  if (Object.prototype.toString.call(값) === '[object Date]') {
    return Utilities.formatDate(
      값,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm'
    );
  }

  return String(값);
}


// =====================================================================
// 병원 정보 조회 (세션 병원 1건)
// =====================================================================

function HOSPITAL_get(token) {

  const session = HOSPITAL_세션_(token);
  const 병원ID = String(session['병원ID']);

  const rows = HOSPITAL_전체행_(HOSPITAL_시트_());

  for (let i = 0; i < rows.length; i++) {

    if (String(rows[i][0] || '').trim() !== 병원ID) {
      continue;
    }

    return {
      병원ID: String(rows[i][0] || ''),
      병원명: String(rows[i][1] || ''),
      병원코드: String(rows[i][2] || ''),
      사용여부: HOSPITAL_불린_(rows[i][3]),
      등록일시: HOSPITAL_일시문자열_(rows[i][4]),
      수정일시: HOSPITAL_일시문자열_(rows[i][5])
    };
  }

  throw new Error('병원 정보를 찾을 수 없습니다: ' + 병원ID);
}


// =====================================================================
// 병원 정보 수정
//
// data = {
//   병원명: '',
//   병원코드: ''
// }
//
// 병원ID는 세션에서만 가져온다. 클라이언트 값은 신뢰하지 않는다.
// =====================================================================

function HOSPITAL_save(token, data) {

  const session = HOSPITAL_세션_(token);
  const 병원ID = String(session['병원ID']);

  const 병원명 = String((data && data.병원명) || '').trim();
  const 병원코드 = String((data && data.병원코드) || '').trim().toUpperCase();

  // ---------------------------------------------------------------
  // 입력 검증
  // ---------------------------------------------------------------

  if (!병원명) {
    throw new Error('병원명을 입력해주세요.');
  }

  if (병원명.length > 50) {
    throw new Error('병원명은 50자 이내로 입력해주세요.');
  }

  if (!병원코드) {
    throw new Error('병원코드를 입력해주세요.');
  }

  if (!HOSPITAL_코드형식_.test(병원코드)) {
    throw new Error(
      '병원코드는 영문 대문자와 숫자 2~10자로 입력해주세요.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {

    const sheet = HOSPITAL_시트_();
    const rows = HOSPITAL_전체행_(sheet);

    let targetIndex = -1;

    for (let i = 0; i < rows.length; i++) {

      const rowId = String(rows[i][0] || '').trim();

      // 대상 행 찾기
      if (rowId === 병원ID) {
        targetIndex = i;
        continue;
      }

      // 병원코드 중복 검사 (전체 병원 대상, 자기 자신 제외)
      if (
        String(rows[i][2] || '').trim().toUpperCase() === 병원코드
      ) {
        throw new Error(
          '이미 사용 중인 병원코드입니다: ' + 병원코드
        );
      }

      // 병원명 중복 검사 (전체 병원 대상, 자기 자신 제외)
      if (
        String(rows[i][1] || '').trim() === 병원명
      ) {
        throw new Error(
          '이미 사용 중인 병원명입니다: ' + 병원명
        );
      }
    }

    if (targetIndex === -1) {
      throw new Error('병원 정보를 찾을 수 없습니다: ' + 병원ID);
    }

    const target = rows[targetIndex];

    // 병원ID / 사용여부 / 등록일시는 기존 값 유지. 수정일시만 갱신.
    sheet
      .getRange(targetIndex + 2, 1, 1, 6)
      .setValues([[
        target[0],
        병원명,
        병원코드,
        target[3],
        target[4],
        new Date()
      ]]);

    SpreadsheetApp.flush();

    return '병원 정보가 수정되었습니다.';

  } finally {
    lock.releaseLock();
  }
}


// =====================================================================
// 병원 현황 (이 병원에 등록된 데이터 건수)
//
// 각 시트의 병원ID 컬럼으로 집계한다.
// 아직 데이터가 없거나 시트가 없어도 0을 반환하고 실패시키지 않는다.
// =====================================================================

function HOSPITAL_현황(token) {

  const session = HOSPITAL_세션_(token);
  const 병원ID = String(session['병원ID']);

  // 해당 병원 행만 추린다
  const 행가져오기 = function(테이블) {

    try {

      return DB_getAll(테이블).filter(function(row) {
        return String(row['병원ID'] || '').trim() === 병원ID;
      });

    } catch (e) {
      return [];
    }
  };

  // 사용여부 true 개수
  const 사용중개수 = function(rows) {

    return rows.filter(function(row) {
      return HOSPITAL_불린_(row['사용여부']);
    }).length;
  };

  const 사용자행 = 행가져오기('사용자');

  // 매출은 아직 산출 근거가 없다.
  // 05_시술에 금액 컬럼이 없고 시술 등록 기능도 미구현이므로
  // 임의의 값을 만들지 않고 미연결 상태를 명시한다.
  // 시술 기능 구현 시 이 부분을 실제 집계로 교체한다.
  return {
    사용자_사용중: 사용중개수(사용자행),
    사용자_전체: 사용자행.length,

    금일매출: null,
    월매출: null,
    매출연결여부: false
  };
}


// =====================================================================
// 통합 테스트 (조회 → 수정 → 재조회 → 원복)
//
// 편집기에서 직접 실행. 실제 데이터를 건드리므로 마지막에 원래 값으로
// 되돌린다. 테스트 대상은 H003(테스트병원).
// =====================================================================

function test_HOSPITAL_전체흐름() {

  const 테스트병원ID = 'H003';

  Logger.log('=== 병원 관리 테스트 시작 ===');

  const token = AUTH_createSession({
    사용자ID: '__TEST_ADMIN__',
    병원ID: 테스트병원ID,
    아이디: '__test__',
    이름: '테스트관리자',
    권한: 'ADMIN'
  });

  try {

    // 1) 조회
    const 원본 = HOSPITAL_get(token);

    Logger.log(
      '1. 조회: ' + 원본.병원ID +
      ' / ' + 원본.병원명 +
      ' / ' + 원본.병원코드 +
      ' / 사용여부=' + 원본.사용여부
    );

    // 2) 수정
    Logger.log('2. 수정: ' + HOSPITAL_save(token, {
      병원명: 원본.병원명 + '_수정',
      병원코드: 'ZZTEST'
    }));

    // 3) 재조회
    const 수정후 = HOSPITAL_get(token);

    Logger.log(
      '3. 재조회: ' + 수정후.병원명 +
      ' / ' + 수정후.병원코드 +
      ' / 수정일시=' + 수정후.수정일시
    );

    Logger.log(
      '4. 사용여부 보존 확인: ' + 수정후.사용여부 +
      ' (원본 ' + 원본.사용여부 + '과 같아야 정상)'
    );

    Logger.log(
      '5. 등록일시 보존 확인: ' + (수정후.등록일시 === 원본.등록일시)
    );

    // 6) 잘못된 병원코드 차단 확인
    try {
      HOSPITAL_save(token, {
        병원명: 원본.병원명,
        병원코드: 'test-1'
      });
      Logger.log('6. 코드 형식 검사: 실패 (차단되지 않음)');
    } catch (e) {
      Logger.log('6. 코드 형식 검사: 정상 차단 - ' + e.message);
    }

    // 7) 병원코드 중복 차단 확인 (H001 코드 사용 시도)
    try {
      const 다른병원코드 = HOSPITAL_다른병원코드_(테스트병원ID);

      if (다른병원코드) {
        HOSPITAL_save(token, {
          병원명: 원본.병원명,
          병원코드: 다른병원코드
        });
        Logger.log('7. 코드 중복 검사: 실패 (차단되지 않음)');
      } else {
        Logger.log('7. 코드 중복 검사: 비교 대상 병원 없음, 건너뜀');
      }
    } catch (e) {
      Logger.log('7. 코드 중복 검사: 정상 차단 - ' + e.message);
    }

    // 8) 원복
    Logger.log('8. 원복: ' + HOSPITAL_save(token, {
      병원명: 원본.병원명,
      병원코드: 원본.병원코드
    }));

    const 최종 = HOSPITAL_get(token);

    Logger.log(
      '9. 원복 확인: ' + 최종.병원명 +
      ' / ' + 최종.병원코드
    );

    // 10) 현황 집계
    const 현황 = HOSPITAL_현황(token);

    Logger.log(
      '10. 현황: 사용자 ' + 현황.사용자_사용중 + '/' + 현황.사용자_전체 +
      ', 매출연결여부=' + 현황.매출연결여부
    );

  } finally {
    AUTH_logout(token);
  }

  Logger.log('=== 병원 관리 테스트 종료 ===');
}


// 테스트 보조: 자기 병원이 아닌 다른 병원의 병원코드 하나 반환
function HOSPITAL_다른병원코드_(제외병원ID) {

  const rows = HOSPITAL_전체행_(HOSPITAL_시트_());

  for (let i = 0; i < rows.length; i++) {

    if (String(rows[i][0] || '').trim() === 제외병원ID) {
      continue;
    }

    const 코드 = String(rows[i][2] || '').trim();

    if (코드) {
      return 코드;
    }
  }

  return '';
}