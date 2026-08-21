/**
 * Migrate.gs
 * VIVICELL LAB ERP — 병원별 데이터 분리 마이그레이션
 *
 * 목적
 *   1) 04_거래처 : 12열 -> 16열 재구성
 *      추가: 병원ID / 취급품목 / 결제수단 / 결제조건 / 은행 / 계좌번호 / 예금주
 *      제거: 대표자 / 이메일 / 주소
 *      개명: 사용여부 -> 거래여부
 *   2) 06_시술사용품목 / 08_발주품목 / 10_입고품목 / 11_LOT : 병원ID 컬럼 추가
 *
 * 원칙
 *   - 재실행 안전(idempotent). 이미 반영된 시트는 건너뛴다.
 *   - 데이터가 있는 시트는 임의로 건드리지 않고 중단한다.
 *   - 다른 .gs 파일에 의존하지 않는다. 단독 실행 가능.
 *
 * 실행 순서
 *   1. test_MIG_현황확인()  <- 먼저 실행해 현재 상태를 눈으로 확인
 *   2. MIG_전체실행()       <- 실제 반영
 *   3. test_MIG_현황확인()  <- 반영 결과 재확인
 *
 * 주의
 *   이 마이그레이션 이후 Code.gs 의 DB_초기화() 헤더 정의를 함께 갱신하기 전까지
 *   DB_초기화() 를 실행하면 구 헤더로 되돌아간다.
 */

/* ===================== 설정 ===================== */

var MIG_SS_ID = '14QwrzCw1mZbegqUsFH2qgIUYl6I_6W7pE-Ubx2-qw9w';

/** 04_거래처 최종 헤더 (16열) */
var MIG_거래처헤더 = [
  '거래처ID', '병원ID', '거래처명', '취급품목', '사업자번호',
  '담당자', '전화번호',
  '결제수단', '결제조건', '은행', '계좌번호', '예금주',
  '메모', '거래여부', '등록일시', '수정일시'
];

/** 병원ID 컬럼을 추가할 시트 목록. 삽입 위치는 항상 1번 컬럼(ID) 바로 뒤 */
var MIG_병원ID대상 = [
  { 시트명: '06_시술사용품목', 선행컬럼: '사용ID' },
  { 시트명: '08_발주품목',     선행컬럼: '발주품목ID' },
  { 시트명: '10_입고품목',     선행컬럼: '입고품목ID' },
  { 시트명: '11_LOT',          선행컬럼: 'LOTID' }
];


/* ===================== 진입점 ===================== */

/**
 * 마이그레이션 전체 실행.
 * @return {Object} 처리 결과 요약
 */
// =====================================================================
// 멤버십 도입 마이그레이션 (2026-08-21)
//
//   1) 15_멤버십 시트 생성 (없을 때만)
//   2) 05_시술에 '멤버십ID' 컬럼 추가 — '시술구분' 바로 뒤 (22열 → 23열)
//
// 재실행 안전: 이미 반영된 항목은 건너뛴다.
// 편집기에서 MIG_멤버십도입() 을 직접 실행하고 Logger 를 확인할 것.
// =====================================================================

function MIG_멤버십도입() {

  var 결과 = [];

  // ---- 1) 15_멤버십 시트 ----
  try {

    var ss = SpreadsheetApp.openById(MIG_SS_ID);
    var 멤버십시트 = ss.getSheetByName('15_멤버십');

    /* 구 이름(15_회원권)으로 만들어진 시트가 있으면 이름을 바꾼다.
       2026-08-21 회원권 → 멤버십 명칭 변경. 데이터 0행일 때만 안전하다 */
    var 구시트 = ss.getSheetByName('15_회원권');

    if (구시트 && !멤버십시트) {

      if (구시트.getLastRow() > 1) {
        결과.push('[실패] 15_회원권에 데이터가 있습니다. 수동 확인 필요');
      } else {
        ss.deleteSheet(구시트);
        결과.push('[반영] 구 시트 15_회원권 삭제 (데이터 0행)');
        구시트 = null;
      }
    }

    if (멤버십시트) {

      /* 헤더가 바뀌었으면(결제액·보너스·등급 도입) 데이터가 없을 때만 갱신 */
      var 현재헤더 = MIG_헤더읽기_(멤버십시트);

      if (MIG_헤더동일_(현재헤더, MEMB_헤더)) {
        결과.push('[건너뜀] 15_멤버십 헤더 일치 (' + MEMB_헤더.length + '열)');
      } else if (멤버십시트.getLastRow() > 1) {
        결과.push('[실패] 15_멤버십 헤더가 다른데 데이터가 있습니다. 수동 확인 필요');
      } else {
        멤버십시트.clear();
        멤버십시트
          .getRange(1, 1, 1, MEMB_헤더.length)
          .setValues([MEMB_헤더]);
        멤버십시트.setFrozenRows(1);
        MIG_헤더서식_(멤버십시트, MEMB_헤더.length);
        결과.push('[반영] 15_멤버십 헤더 갱신 (' + MEMB_헤더.length + '열, 데이터 0행)');
      }

    } else {

      멤버십시트 = ss.insertSheet('15_멤버십');

      멤버십시트
        .getRange(1, 1, 1, MEMB_헤더.length)
        .setValues([MEMB_헤더]);

      멤버십시트.setFrozenRows(1);
      MIG_헤더서식_(멤버십시트, MEMB_헤더.length);

      결과.push('[반영] 15_멤버십 시트 생성 (' + MEMB_헤더.length + '열)');
    }

  } catch (e) {
    결과.push('[실패] 15_멤버십: ' + e.message);
  }

  // ---- 2) 05_시술 멤버십ID 컬럼 ----
  try {

    var 시술시트 = MIG_시트열기_('05_시술');
    var 헤더 = MIG_헤더읽기_(시술시트);

    /* 구 컬럼명(회원권ID)이 있으면 이름만 바꾼다.
       2026-08-21 명칭 변경. 컬럼을 다시 만들면 값이 날아가므로 rename 이 맞다 */
    var 구위치 = 헤더.indexOf('회원권ID');

    if (구위치 !== -1 && 헤더.indexOf('멤버십ID') === -1) {
      시술시트.getRange(1, 구위치 + 1).setValue('멤버십ID');
      결과.push('[반영] 05_시술: 회원권ID → 멤버십ID 컬럼명 변경');
      헤더 = MIG_헤더읽기_(시술시트);
    }

    if (헤더.indexOf('멤버십ID') !== -1) {
      결과.push('[건너뜀] 05_시술: 멤버십ID 컬럼이 이미 존재 (' + 헤더.length + '열)');
    } else {

      var 위치 = 헤더.indexOf('시술구분');

      if (위치 === -1) {
        결과.push('[실패] 05_시술: 시술구분 컬럼을 찾을 수 없습니다.');
      } else {

        // 시술구분 바로 뒤에 삽입 (1-based 이므로 위치+1 뒤 = 위치+2)
        시술시트.insertColumnAfter(위치 + 1);
        시술시트.getRange(1, 위치 + 2).setValue('멤버십ID');

        MIG_헤더서식_(시술시트, 시술시트.getLastColumn());

        결과.push('[반영] 05_시술: 멤버십ID 컬럼 추가 (' +
          시술시트.getLastColumn() + '열). 기존 행은 공란');
      }
    }

  } catch (e2) {
    결과.push('[실패] 05_시술: ' + e2.message);
  }

  // ---- 3) 16_다회차 시트 ----
  try {

    var ss2 = SpreadsheetApp.openById(MIG_SS_ID);
    var 다회차시트 = ss2.getSheetByName('16_다회차');

    if (다회차시트) {

      var 다현재 = MIG_헤더읽기_(다회차시트);

      if (MIG_헤더동일_(다현재, MULT_헤더)) {
        결과.push('[건너뜀] 16_다회차 헤더 일치 (' + MULT_헤더.length + '열)');
      } else if (다회차시트.getLastRow() > 1) {
        결과.push('[실패] 16_다회차 헤더가 다른데 데이터가 있습니다. 수동 확인 필요');
      } else {
        다회차시트.clear();
        다회차시트.getRange(1, 1, 1, MULT_헤더.length).setValues([MULT_헤더]);
        다회차시트.setFrozenRows(1);
        MIG_헤더서식_(다회차시트, MULT_헤더.length);
        결과.push('[반영] 16_다회차 헤더 갱신 (' + MULT_헤더.length + '열)');
      }

    } else {

      다회차시트 = ss2.insertSheet('16_다회차');
      다회차시트.getRange(1, 1, 1, MULT_헤더.length).setValues([MULT_헤더]);
      다회차시트.setFrozenRows(1);
      MIG_헤더서식_(다회차시트, MULT_헤더.length);
      결과.push('[반영] 16_다회차 시트 생성 (' + MULT_헤더.length + '열)');
    }

  } catch (e3) {
    결과.push('[실패] 16_다회차: ' + e3.message);
  }

  // ---- 4) 05_시술 다회차ID 컬럼 ----
  try {

    var 시술시트2 = MIG_시트열기_('05_시술');
    var 헤더2 = MIG_헤더읽기_(시술시트2);

    if (헤더2.indexOf('다회차ID') !== -1) {
      결과.push('[건너뜀] 05_시술: 다회차ID 컬럼이 이미 존재 (' + 헤더2.length + '열)');
    } else {

      var 위치2 = 헤더2.indexOf('멤버십ID');

      if (위치2 === -1) {
        결과.push('[실패] 05_시술: 멤버십ID 컬럼을 찾을 수 없습니다.');
      } else {
        시술시트2.insertColumnAfter(위치2 + 1);
        시술시트2.getRange(1, 위치2 + 2).setValue('다회차ID');
        MIG_헤더서식_(시술시트2, 시술시트2.getLastColumn());
        결과.push('[반영] 05_시술: 다회차ID 컬럼 추가 (' +
          시술시트2.getLastColumn() + '열). 기존 행은 공란');
      }
    }

  } catch (e4) {
    결과.push('[실패] 05_시술 다회차ID: ' + e4.message);
  }

  Logger.log('===== 멤버십 도입 마이그레이션 =====');
  결과.forEach(function (m) { Logger.log('  ' + m); });

  return 결과;
}


// 반영 결과 확인 (읽기 전용)
function test_MIG_멤버십검증() {

  var 통과 = [], 실패 = [];

  try {
    var 멤버십헤더 = MIG_헤더읽기_(MIG_시트열기_('15_멤버십'));
    if (MIG_헤더동일_(멤버십헤더, MEMB_헤더)) {
      통과.push('15_멤버십 헤더 일치 (' + 멤버십헤더.length + '열)');
    } else {
      실패.push('15_멤버십 헤더 불일치: ' + 멤버십헤더.join(','));
    }
  } catch (e) { 실패.push('15_멤버십: ' + e.message); }

  try {
    var 다회차헤더 = MIG_헤더읽기_(MIG_시트열기_('16_다회차'));
    if (MIG_헤더동일_(다회차헤더, MULT_헤더)) {
      통과.push('16_다회차 헤더 일치 (' + 다회차헤더.length + '열)');
    } else {
      실패.push('16_다회차 헤더 불일치: ' + 다회차헤더.join(','));
    }
  } catch (e3) { 실패.push('16_다회차: ' + e3.message); }

  try {
    var 시술헤더 = MIG_헤더읽기_(MIG_시트열기_('05_시술'));
    if (MIG_헤더동일_(시술헤더, PROC_새헤더)) {
      통과.push('05_시술 헤더 일치 (' + 시술헤더.length + '열)');
    } else {
      실패.push('05_시술 헤더 불일치: ' + 시술헤더.join(','));
    }
  } catch (e2) { 실패.push('05_시술: ' + e2.message); }

  Logger.log('===== 멤버십 도입 검증 =====');
  Logger.log('통과 ' + 통과.length + ' / 실패 ' + 실패.length);
  통과.forEach(function (m) { Logger.log('  [OK] ' + m); });
  실패.forEach(function (m) { Logger.log('  [NG] ' + m); });

  return { 통과: 통과, 실패: 실패 };
}


function MIG_전체실행() {
  var 결과 = { 성공: [], 건너뜀: [], 실패: [] };

  try {
    var 거래처결과 = MIG_거래처재구성_();
    (거래처결과.변경 ? 결과.성공 : 결과.건너뜀).push(거래처결과.메시지);
  } catch (e) {
    결과.실패.push('04_거래처: ' + e.message);
  }

  for (var i = 0; i < MIG_병원ID대상.length; i++) {
    var 대상 = MIG_병원ID대상[i];
    try {
      var r = MIG_병원ID컬럼추가_(대상.시트명, 대상.선행컬럼);
      (r.변경 ? 결과.성공 : 결과.건너뜀).push(r.메시지);
    } catch (e2) {
      결과.실패.push(대상.시트명 + ': ' + e2.message);
    }
  }

  Logger.log('===== 마이그레이션 결과 =====');
  Logger.log('반영 ' + 결과.성공.length + '건');
  결과.성공.forEach(function (m) { Logger.log('  [반영] ' + m); });
  Logger.log('건너뜀 ' + 결과.건너뜀.length + '건');
  결과.건너뜀.forEach(function (m) { Logger.log('  [건너뜀] ' + m); });
  Logger.log('실패 ' + 결과.실패.length + '건');
  결과.실패.forEach(function (m) { Logger.log('  [실패] ' + m); });

  return 결과;
}


/* ===================== 개별 처리 ===================== */

/**
 * 04_거래처를 18열 구조로 재구성한다.
 * 데이터 행이 있으면 중단한다 (수동 확인 필요).
 * @private
 */
function MIG_거래처재구성_() {
  var 시트 = MIG_시트열기_('04_거래처');
  var 현재헤더 = MIG_헤더읽기_(시트);

  if (MIG_헤더동일_(현재헤더, MIG_거래처헤더)) {
    return { 변경: false, 메시지: '04_거래처: 이미 18열 구조. 변경 없음' };
  }

  var 데이터행수 = Math.max(0, 시트.getLastRow() - 1);
  if (데이터행수 > 0) {
    throw new Error(
      '데이터 ' + 데이터행수 + '행이 존재해 자동 재구성을 중단했습니다. ' +
      '기존 데이터를 백업한 뒤 다시 실행하거나, 수동으로 컬럼을 맞춰주십시오.'
    );
  }

  // 데이터 0행 -> 헤더만 재작성
  var 기존열수 = Math.max(시트.getLastColumn(), MIG_거래처헤더.length);
  시트.getRange(1, 1, 1, 기존열수).clearContent();
  if (시트.getMaxColumns() < MIG_거래처헤더.length) {
    시트.insertColumnsAfter(시트.getMaxColumns(), MIG_거래처헤더.length - 시트.getMaxColumns());
  }
  시트.getRange(1, 1, 1, MIG_거래처헤더.length).setValues([MIG_거래처헤더]);
  MIG_헤더서식_(시트, MIG_거래처헤더.length);
  시트.setFrozenRows(1);

  return {
    변경: true,
    메시지: '04_거래처: ' + 현재헤더.length + '열 -> ' + MIG_거래처헤더.length + '열 재구성 완료 (데이터 0행)'
  };
}

/**
 * 지정 시트의 1번 컬럼 뒤에 병원ID 컬럼을 삽입한다.
 * @param {string} 시트명
 * @param {string} 선행컬럼 헤더 1번 컬럼에 있어야 할 이름 (구조 검증용)
 * @private
 */
function MIG_병원ID컬럼추가_(시트명, 선행컬럼) {
  var 시트 = MIG_시트열기_(시트명);
  var 헤더 = MIG_헤더읽기_(시트);

  if (헤더.indexOf('병원ID') !== -1) {
    return { 변경: false, 메시지: 시트명 + ': 병원ID 컬럼이 이미 존재 (' + 헤더.length + '열). 변경 없음' };
  }

  if (헤더[0] !== 선행컬럼) {
    throw new Error(
      '1번 컬럼이 "' + 선행컬럼 + '"이 아니라 "' + 헤더[0] + '"입니다. ' +
      '시트 구조가 예상과 달라 중단했습니다.'
    );
  }

  var 데이터행수 = Math.max(0, 시트.getLastRow() - 1);

  시트.insertColumnAfter(1);
  시트.getRange(1, 2).setValue('병원ID');
  MIG_헤더서식_(시트, 헤더.length + 1);
  시트.setFrozenRows(1);

  var 안내 = (데이터행수 > 0)
    ? ' / 기존 ' + 데이터행수 + '행의 병원ID는 공란이므로 부모 레코드 기준으로 별도 채워야 합니다'
    : ' (데이터 0행)';

  return {
    변경: true,
    메시지: 시트명 + ': ' + 헤더.length + '열 -> ' + (헤더.length + 1) + '열, 병원ID 추가' + 안내
  };
}


/* ===================== 내부 유틸 ===================== */

/** @private */
function MIG_시트열기_(시트명) {
  var ss = SpreadsheetApp.openById(MIG_SS_ID);
  var 시트 = ss.getSheetByName(시트명);
  if (!시트) throw new Error('시트를 찾을 수 없습니다: ' + 시트명);
  return 시트;
}

/** @private */
function MIG_헤더읽기_(시트) {
  var 열수 = 시트.getLastColumn();
  if (열수 < 1) return [];
  return 시트.getRange(1, 1, 1, 열수).getValues()[0]
    .map(function (v) { return String(v == null ? '' : v).trim(); })
    .filter(function (v) { return v !== ''; });
}

/** @private */
function MIG_헤더동일_(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** @private */
function MIG_헤더서식_(시트, 열수) {
  시트.getRange(1, 1, 1, 열수)
    .setBackground('#f6f2fe')
    .setFontColor('#40385f')
    .setFontWeight('bold');
}


/* ===================== 검증용 ===================== */

/**
 * 대상 시트 5개의 현재 헤더와 데이터 행수를 로그로 출력한다.
 * 마이그레이션 전후로 실행해 비교한다. 시트를 변경하지 않는다.
 */
function test_MIG_현황확인() {
  var 대상 = ['04_거래처'];
  MIG_병원ID대상.forEach(function (d) { 대상.push(d.시트명); });

  Logger.log('===== 시트 현황 (' + new Date() + ') =====');
  대상.forEach(function (시트명) {
    try {
      var 시트 = MIG_시트열기_(시트명);
      var 헤더 = MIG_헤더읽기_(시트);
      var 행수 = Math.max(0, 시트.getLastRow() - 1);
      var 병원ID = (헤더.indexOf('병원ID') !== -1) ? 'O(' + (헤더.indexOf('병원ID') + 1) + '번)' : 'X';
      Logger.log(시트명 + ' | ' + 헤더.length + '열 | 데이터 ' + 행수 + '행 | 병원ID ' + 병원ID);
      Logger.log('    ' + 헤더.join(' | '));
    } catch (e) {
      Logger.log(시트명 + ' | 오류: ' + e.message);
    }
  });
}

/**
 * 마이그레이션이 정상 반영됐는지 검증한다.
 * 시트를 변경하지 않는다.
 */
function test_MIG_검증() {
  var 통과 = [], 실패 = [];

  try {
    var 거래처헤더 = MIG_헤더읽기_(MIG_시트열기_('04_거래처'));
    if (MIG_헤더동일_(거래처헤더, MIG_거래처헤더)) {
      통과.push('04_거래처 18열 일치');
    } else {
      실패.push('04_거래처 헤더 불일치: ' + 거래처헤더.join(','));
    }
  } catch (e) { 실패.push('04_거래처: ' + e.message); }

  MIG_병원ID대상.forEach(function (d) {
    try {
      var 헤더 = MIG_헤더읽기_(MIG_시트열기_(d.시트명));
      if (헤더[1] === '병원ID') {
        통과.push(d.시트명 + ' 병원ID 2번 컬럼 확인 (' + 헤더.length + '열)');
      } else {
        실패.push(d.시트명 + ' 2번 컬럼이 병원ID가 아님: ' + 헤더[1]);
      }
    } catch (e) { 실패.push(d.시트명 + ': ' + e.message); }
  });

  Logger.log('===== 검증 결과 =====');
  Logger.log('통과 ' + 통과.length + ' / 실패 ' + 실패.length);
  통과.forEach(function (m) { Logger.log('  [OK] ' + m); });
  실패.forEach(function (m) { Logger.log('  [NG] ' + m); });

  return { 통과: 통과, 실패: 실패 };
}