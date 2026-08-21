// =====================================================================
// Multi.gs — 다회차 도메인 서버 함수 (MULT_*)
//
// - 대상 시트: 16_다회차 (14열)
// - 채번: T000001 (전 병원 통합). 기존 접두사 H·U·P·M·S·B·V·K 와 겹치지 않게 T
//
// ★ 멤버십과 무엇이 다른가 (2026-08-21 사용자 설명)
//   다회차 = 특정 시술 N회 패키지. 예: 쥬베룩 3회권 30만원
//            8/1 에 30만원 전액 결제 → 병원 매출은 8/1
//            8/2·8/3·8/4 시술 → 시술 매출은 각 10만원씩
//            잔여는 **횟수**로 센다
//   멤버십 = 선불 충전. 100만원 결제 + 보너스 10% = 110만원 사용 가능
//            잔여는 **금액**으로 센다. 아무 시술에나 쓸 수 있다
//
// ★ 잔여는 저장하지 않고 계산한다 (멤버십과 같은 이유)
//   사용회수 = 05_시술에서 다회차ID 일치 + 상태 != '취소' 인 행 수
//   잔여회수 = 총회수 - 사용회수
//   시술을 취소하면 잔여가 자동으로 복구된다
//
// ★ 회차당 금액: 총액이 회수로 나눠떨어지지 않을 때 (예: 10만원 3회)
//   기본 회차 = 내림(총액/총회수), **마지막 회차는 남은 금액 전부**.
//   이렇게 해야 회차 금액의 합이 총액과 정확히 일치한다.
//   MULT_다음회차금액_() 이 이 규칙을 담당한다
// =====================================================================


var MULT_상태_사용중 = '사용중';
var MULT_상태_종료 = '종료';

var MULT_헤더 = [
  '다회차ID',
  '병원ID',
  '환자번호',
  '환자명',
  '시술명',
  '총회수',
  '총액',
  '결제일',
  '유효기간',
  '상태',
  '비고',
  '등록일시',
  '수정일시'
];


// =====================================================================
// 내부 헬퍼
// =====================================================================

function MULT_세션확인_(token) {

  var session = AUTH_getSession(token);

  if (!session || !session.병원ID) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  return session;
}


function MULT_새ID목록_(개수) {

  var rows = DB_getAll('다회차');
  var max = 0;

  rows.forEach(function(row) {

    var id = String(row['다회차ID'] || '');

    if (id.charAt(0) === 'T') {
      var n = parseInt(id.substring(1), 10);
      if (!isNaN(n) && n > max) {
        max = n;
      }
    }
  });

  var list = [];

  for (var i = 1; i <= 개수; i++) {
    list.push('T' + ('000000' + (max + i)).slice(-6));
  }

  return list;
}


// 다회차ID → { 회수, 금액합 } (취소 제외). 05_시술을 1회만 훑는다
function MULT_사용맵_(병원ID) {

  var 맵 = {};

  DB_findWhere('시술', { 병원ID: 병원ID }).forEach(function(row) {

    if (String(row['상태']) === PROC_상태_취소) {
      return;
    }

    var id = String(row['다회차ID'] || '').trim();

    if (id === '') {
      return;
    }

    if (!맵[id]) {
      맵[id] = { 회수: 0, 금액합: 0 };
    }

    맵[id].회수++;
    맵[id].금액합 += Number(row['시술금액']) || 0;
  });

  return 맵;
}


/* 다음 회차에 차감할 금액.
   마지막 회차면 남은 금액 전부 → 회차 금액 합계가 총액과 정확히 맞는다 */
function MULT_다음회차금액_(총액, 총회수, 사용회수, 사용금액합) {

  var 남은회수 = 총회수 - 사용회수;

  if (남은회수 <= 0) {
    return 0;
  }

  if (남은회수 === 1) {
    return 총액 - 사용금액합;   // 나머지 보정
  }

  return Math.floor(총액 / 총회수);
}


function MULT_행변환_(row, 사용맵) {

  var id = String(row['다회차ID'] || '');
  var 총회수 = Number(row['총회수']) || 0;
  var 총액 = Number(row['총액']) || 0;

  var 사용 = 사용맵[id] || { 회수: 0, 금액합: 0 };
  var 잔여회수 = 총회수 - 사용.회수;

  var 유효기간 = PROC_날짜문자열_(row['유효기간']);
  var 상태 = String(row['상태'] || MULT_상태_사용중);

  var 오늘 = PROC_날짜문자열_(new Date());
  var 만료됨 = 유효기간 !== '' && 유효기간 < 오늘;

  return {
    다회차ID: id,
    환자번호: String(row['환자번호'] || ''),
    환자명: String(row['환자명'] || ''),
    시술명: String(row['시술명'] || ''),
    총회수: 총회수,
    사용회수: 사용.회수,
    잔여회수: 잔여회수,
    총액: 총액,
    사용금액: 사용.금액합,
    잔여금액: 총액 - 사용.금액합,
    다음회차금액: MULT_다음회차금액_(총액, 총회수, 사용.회수, 사용.금액합),
    결제일: PROC_날짜문자열_(row['결제일']),
    유효기간: 유효기간,
    상태: 상태,
    만료됨: 만료됨,
    사용가능: 상태 === MULT_상태_사용중 && !만료됨 && 잔여회수 > 0,
    비고: String(row['비고'] || '')
  };
}


// =====================================================================
// 목록 조회
// =====================================================================

function MULT_getList(token, 조건) {

  var session = MULT_세션확인_(token);

  조건 = 조건 || {};

  var 종료포함 = 조건.종료포함 === true;
  var 환자번호 = String(조건.환자번호 || '').trim();

  var 사용맵 = MULT_사용맵_(session.병원ID);

  var 목록 = DB_findWhere('다회차', { 병원ID: session.병원ID })
    .map(function(row) {
      return MULT_행변환_(row, 사용맵);
    })
    .filter(function(m) {

      if (!종료포함 && m.상태 === MULT_상태_종료) {
        return false;
      }

      if (환자번호 !== '' && m.환자번호.indexOf(환자번호) === -1) {
        return false;
      }

      return true;
    });

  목록.sort(function(a, b) {

    if (a.결제일 !== b.결제일) {
      return a.결제일 < b.결제일 ? 1 : -1;
    }

    return a.다회차ID < b.다회차ID ? 1 : -1;
  });

  return 목록;
}


// 특정 환자의 사용 가능한 다회차 (시술 등록 드롭다운용)
function MULT_사용가능목록(token, 환자번호) {

  var session = MULT_세션확인_(token);

  var 번호 = String(환자번호 || '').trim();

  if (번호 === '') {
    return [];
  }

  var 사용맵 = MULT_사용맵_(session.병원ID);

  return DB_findWhere('다회차', { 병원ID: session.병원ID, 환자번호: 번호 })
    .map(function(row) {
      return MULT_행변환_(row, 사용맵);
    })
    .filter(function(m) {
      return m.사용가능;
    });
}


// 사용 내역 (상세 팝업용)
function MULT_사용내역(token, 다회차ID) {

  var session = MULT_세션확인_(token);

  var id = String(다회차ID || '').trim();

  if (id === '') {
    return [];
  }

  return DB_findWhere('시술', { 병원ID: session.병원ID })
    .filter(function(row) {
      return String(row['다회차ID'] || '').trim() === id;
    })
    .map(function(row) {
      return {
        시술ID: row['시술ID'],
        시술일: PROC_날짜문자열_(row['시술일']),
        시술명: String(row['시술명'] || ''),
        용량: row['용량'] === undefined ? '' : String(row['용량']),
        단위: String(row['단위'] || ''),
        시술금액: Number(row['시술금액']) || 0,
        상태: String(row['상태'] || '')
      };
    })
    .sort(function(a, b) {
      if (a.시술일 !== b.시술일) {
        return a.시술일 < b.시술일 ? 1 : -1;
      }
      return a.시술ID < b.시술ID ? 1 : -1;
    });
}


// =====================================================================
// 등록
// data: { 환자번호(필수), 환자명, 시술명(필수), 총회수(필수), 총액(필수),
//         결제일(필수), 유효기간, 비고 }
// ★ 시술명은 기준정보 목록에 있어야 한다 (시술 등록과 같은 규칙)
// =====================================================================

function MULT_add(token, data) {

  var session = MULT_세션확인_(token);

  data = data || {};

  var 환자번호 = String(data.환자번호 || '').trim();
  var 시술명 = String(data.시술명 || '').trim();
  var 총회수 = Number(data.총회수) || 0;
  var 총액 = PROC_금액정규화_(data.총액);
  var 결제일 = PROC_날짜문자열_(data.결제일 || '');

  if (환자번호 === '') {
    throw new Error('환자번호를 입력해주세요.');
  }

  if (시술명 === '') {
    throw new Error('시술명을 선택해주세요.');
  }

  if (BASE_값목록_(session.병원ID, '시술명').indexOf(시술명) === -1) {
    throw new Error('시술명 "' + 시술명 +
      '"은(는) 기준정보 목록에 없습니다. 관리 > 시술 기준 관리 > 시술 관리에서 먼저 등록해주세요.');
  }

  if (총회수 < 1) {
    throw new Error('총회수는 1 이상이어야 합니다.');
  }

  if (총액 <= 0) {
    throw new Error('총액은 0보다 커야 합니다.');
  }

  if (결제일 === '') {
    throw new Error('결제일을 입력해주세요.');
  }

  var 유효기간 = PROC_날짜문자열_(data.유효기간 || '');

  if (유효기간 !== '' && 유효기간 < 결제일) {
    throw new Error('유효기간이 결제일보다 빠릅니다.');
  }

  var 지금 = new Date();

  DB_insertMany('다회차', [{
    다회차ID: MULT_새ID목록_(1)[0],
    병원ID: session.병원ID,
    환자번호: 환자번호,
    환자명: String(data.환자명 || '').trim(),
    시술명: 시술명,
    총회수: 총회수,
    총액: 총액,
    결제일: 결제일,
    유효기간: 유효기간,
    상태: MULT_상태_사용중,
    비고: String(data.비고 || '').trim(),
    등록일시: 지금,
    수정일시: 지금
  }]);

  return { success: true, 환자번호: 환자번호, 시술명: 시술명 };
}


// =====================================================================
// 수정
// ★ 총회수를 이미 사용한 횟수보다, 총액을 이미 차감한 금액보다 줄일 수 없다
// =====================================================================

function MULT_update(token, data) {

  var session = MULT_세션확인_(token);

  data = data || {};

  var id = String(data.다회차ID || '').trim();

  if (id === '') {
    throw new Error('다회차ID가 없습니다.');
  }

  var 기존 = DB_findById('다회차', '다회차ID', id);

  if (!기존) {
    throw new Error('다회차를 찾을 수 없습니다: ' + id);
  }

  if (String(기존['병원ID']) !== String(session.병원ID)) {
    throw new Error('다른 병원의 다회차는 수정할 수 없습니다.');
  }

  var 시술명 = String(data.시술명 || '').trim();
  var 총회수 = Number(data.총회수) || 0;
  var 총액 = PROC_금액정규화_(data.총액);
  var 결제일 = PROC_날짜문자열_(data.결제일 || '');

  if (시술명 === '') {
    throw new Error('시술명을 선택해주세요.');
  }

  if (결제일 === '') {
    throw new Error('결제일을 입력해주세요.');
  }

  var 사용 = MULT_사용맵_(session.병원ID)[id] || { 회수: 0, 금액합: 0 };

  if (총회수 < 사용.회수) {
    throw new Error(
      '총회수를 이미 사용한 횟수보다 줄일 수 없습니다. 사용 ' + 사용.회수 + '회'
    );
  }

  if (총액 < 사용.금액합) {
    throw new Error(
      '총액을 이미 차감한 금액보다 줄일 수 없습니다. 차감 ' +
      사용.금액합.toLocaleString('ko-KR') + '원'
    );
  }

  var 유효기간 = PROC_날짜문자열_(data.유효기간 || '');

  if (유효기간 !== '' && 유효기간 < 결제일) {
    throw new Error('유효기간이 결제일보다 빠릅니다.');
  }

  DB_updateById('다회차', '다회차ID', id, {
    환자명: String(data.환자명 || '').trim(),
    시술명: 시술명,
    총회수: 총회수,
    총액: 총액,
    결제일: 결제일,
    유효기간: 유효기간,
    비고: String(data.비고 || '').trim(),
    수정일시: new Date()
  });

  return { success: true };
}


// =====================================================================
// 상태 변경 (사용중 ↔ 종료)
// =====================================================================

function MULT_상태변경(token, 다회차ID, 상태) {

  var session = MULT_세션확인_(token);

  var id = String(다회차ID || '').trim();
  var 새상태 = String(상태 || '').trim();

  if (새상태 !== MULT_상태_사용중 && 새상태 !== MULT_상태_종료) {
    throw new Error('상태가 올바르지 않습니다: ' + 새상태);
  }

  var 기존 = DB_findById('다회차', '다회차ID', id);

  if (!기존) {
    throw new Error('다회차를 찾을 수 없습니다: ' + id);
  }

  if (String(기존['병원ID']) !== String(session.병원ID)) {
    throw new Error('다른 병원의 다회차는 수정할 수 없습니다.');
  }

  DB_updateById('다회차', '다회차ID', id, {
    상태: 새상태,
    수정일시: new Date()
  });

  return { success: true };
}


// =====================================================================
// 시술 저장용 검증 (Procedure.gs 에서 호출)
//
// ctx = MULT_검증컨텍스트_(병원ID) 를 한 번 만들어 행마다 재사용한다.
// ctx.누적 으로 같은 배치 안에서 같은 다회차를 여러 번 쓰는 것도 잡는다.
// =====================================================================

function MULT_검증컨텍스트_(병원ID) {

  var 사용맵 = MULT_사용맵_(병원ID);
  var 맵 = {};

  DB_findWhere('다회차', { 병원ID: 병원ID }).forEach(function(row) {
    var m = MULT_행변환_(row, 사용맵);
    맵[m.다회차ID] = m;
  });

  /* 누적회수 / 누적금액: 같은 배치에서 같은 다회차를 여러 행이 쓸 때
     회차 번호와 차감액이 정확히 이어지도록 배치 안에서도 누적한다 */
  return { 다회차맵: 맵, 누적: {}, 누적금액: {}, 배정액: {} };
}


function MULT_사용오류_(ctx, 다회차ID, 환자번호, 시술명) {

  var id = String(다회차ID || '').trim();

  if (id === '') {
    return '시술구분이 다회차면 사용할 다회차를 선택해야 합니다.';
  }

  var m = ctx.다회차맵[id];

  if (!m) {
    return '다회차 "' + id + '"을(를) 찾을 수 없습니다.';
  }

  if (String(m.환자번호) !== String(환자번호 || '').trim()) {
    return '다회차 "' + id + '"은(는) 환자번호 ' + m.환자번호 +
      ' 의 것입니다. 이 시술의 환자번호와 다릅니다.';
  }

  if (String(m.시술명) !== String(시술명 || '').trim()) {
    return '다회차 "' + id + '"은(는) "' + m.시술명 +
      '" 전용입니다. 다른 시술에는 쓸 수 없습니다.';
  }

  if (m.상태 === MULT_상태_종료) {
    return '다회차 "' + id + '"은(는) 종료되었습니다.';
  }

  if (m.만료됨) {
    return '다회차 "' + id + '"은(는) 유효기간이 지났습니다 (' + m.유효기간 + ').';
  }

  var 이미회수 = ctx.누적[id] || 0;

  if (m.잔여회수 - 이미회수 <= 0) {
    return '다회차 잔여 횟수가 없습니다. 총 ' + m.총회수 + '회 모두 사용했습니다.';
  }

  /* 이 행이 차감할 금액을 지금 확정해 둔다.
     배치 안에서 앞선 행이 쓴 회수·금액을 더해 계산해야
     마지막 회차 나머지 보정이 정확해진다 */
  var 이미금액 = ctx.누적금액[id] || 0;

  var 이번금액 = MULT_다음회차금액_(
    m.총액,
    m.총회수,
    m.사용회수 + 이미회수,
    m.사용금액 + 이미금액
  );

  ctx.누적[id] = 이미회수 + 1;
  ctx.누적금액[id] = 이미금액 + 이번금액;

  /* 저장 단계에서 꺼내 쓴다. 행 순서대로 쌓이므로 배열로 보관 */
  if (!ctx.배정액[id]) {
    ctx.배정액[id] = [];
  }
  ctx.배정액[id].push(이번금액);

  return null;
}


/* 검증 때 확정해 둔 차감액을 순서대로 꺼낸다.
   MULT_사용오류_ 를 통과한 행에 대해 그 행 순서대로 1회씩 호출할 것 */
function MULT_차감금액꺼내기_(ctx, 다회차ID) {

  var 목록 = ctx.배정액[다회차ID];

  if (!목록 ||목록.length === 0) {
    return 0;
  }

  return 목록.shift();
}


// =====================================================================
// 시술 수정용 검증
// 그 시술이 이미 차지한 1회를 되돌린 뒤 검사한다 (멤버십과 같은 이유)
// =====================================================================

function MULT_수정오류_(병원ID, 다회차ID, 환자번호, 시술명, 기존차감여부) {

  var id = String(다회차ID || '').trim();

  if (id === '') {
    return '시술구분이 다회차면 사용할 다회차를 선택해야 합니다.';
  }

  var row = DB_findById('다회차', '다회차ID', id);

  if (!row || String(row['병원ID']) !== String(병원ID)) {
    return '다회차 "' + id + '"을(를) 찾을 수 없습니다.';
  }

  var m = MULT_행변환_(row, MULT_사용맵_(병원ID));

  if (String(m.환자번호) !== String(환자번호 || '').trim()) {
    return '다회차 "' + id + '"은(는) 환자번호 ' + m.환자번호 + ' 의 것입니다.';
  }

  if (String(m.시술명) !== String(시술명 || '').trim()) {
    return '다회차 "' + id + '"은(는) "' + m.시술명 + '" 전용입니다.';
  }

  if (m.상태 === MULT_상태_종료) {
    return '다회차 "' + id + '"은(는) 종료되었습니다.';
  }

  if (m.만료됨) {
    return '다회차 "' + id + '"은(는) 유효기간이 지났습니다 (' + m.유효기간 + ').';
  }

  // 자기 자신이 이미 1회를 차지하고 있었다면 되돌려서 계산
  var 가용 = m.잔여회수 + (기존차감여부 ? 1 : 0);

  if (가용 <= 0) {
    return '다회차 잔여 횟수가 없습니다. 총 ' + m.총회수 + '회 모두 사용했습니다.';
  }

  return null;
}


// =====================================================================
// 결제 매출 (병원 매출) 집계
//
// ★ 시술 매출과 다른 개념이다 (2026-08-21 사용자 설명).
//   다회차는 결제일에 전액이 병원 매출로 잡히고, 시술 매출은 회차마다 나뉜다.
//   멤버십도 결제일에 결제액이 잡힌다 (보너스는 매출이 아니다).
//   05_시술 집계(시술 매출)와 절대 더하지 말 것 — 이중 계상이 된다.
// =====================================================================

function MULT_결제매출(token) {

  var session = MULT_세션확인_(token);

  var 오늘 = PROC_날짜문자열_(new Date());
  var 당월 = 오늘.substring(0, 7);

  var 결과 = { 금일: 0, 당월: 0, 금일건수: 0, 당월건수: 0 };

  var 더하기 = function(일자, 금액) {

    if (일자 === 오늘) {
      결과.금일 += 금액;
      결과.금일건수++;
    }

    if (일자.substring(0, 7) === 당월) {
      결과.당월 += 금액;
      결과.당월건수++;
    }
  };

  DB_findWhere('다회차', { 병원ID: session.병원ID }).forEach(function(row) {
    더하기(PROC_날짜문자열_(row['결제일']), Number(row['총액']) || 0);
  });

  // 멤버십은 결제액만. 보너스는 실제로 받은 돈이 아니므로 매출이 아니다
  DB_findWhere('멤버십', { 병원ID: session.병원ID }).forEach(function(row) {
    더하기(PROC_날짜문자열_(row['판매일']), Number(row['결제액']) || 0);
  });

  return 결과;
}


// =====================================================================
// 테스트 (편집기에서 수동 실행, Logger 확인)
// ★ 테스트 다회차 1건이 남는다. 확인 후 시트에서 직접 삭제할 것
// =====================================================================

function test_MULT_전체흐름() {

  Logger.log('=== 다회차 전체흐름 테스트 시작 ===');

  var 사용자 = DB_findWhere('사용자', { 병원ID: 'H003', 아이디: 'joon' })[0];

  if (!사용자) {
    Logger.log('★ H003 joon 사용자를 찾을 수 없습니다.');
    return;
  }

  var token = AUTH_createSession(사용자);
  var 시술명 = BASE_값목록_('H003', '시술명')[0];

  if (!시술명) {
    Logger.log('★ 기준정보에 시술명이 없습니다.');
    AUTH_logout(token);
    return;
  }

  // 나눠떨어지지 않는 케이스: 100,000원 3회 → 33,333 / 33,333 / 33,334
  MULT_add(token, {
    환자번호: '9999999',
    환자명: '테스트환자',
    시술명: 시술명,
    총회수: 3,
    총액: 100000,
    결제일: PROC_날짜문자열_(new Date()),
    비고: '자동 테스트'
  });

  var 목록 = MULT_getList(token, {});
  var 대상 = 목록.filter(function(m) { return m.환자번호 === '9999999'; })[0];

  if (!대상) {
    Logger.log('★ 1. 등록 실패');
    AUTH_logout(token);
    return;
  }

  Logger.log('1. 등록: ' + 대상.다회차ID + ' / ' + 대상.시술명 +
    ' / ' + 대상.총회수 + '회 / ' + 대상.총액 + '원');
  Logger.log('2. 잔여: ' + 대상.잔여회수 + '회 (3이어야 정상)');
  Logger.log('3. 1회차 금액: ' + 대상.다음회차금액 + ' (33333이어야 정상)');

  // 회차 금액 합계 검증 (실제 저장 없이 규칙만)
  var 합 = 0, 사용회수 = 0, 사용금액 = 0;
  for (var i = 0; i < 3; i++) {
    var 금액 = MULT_다음회차금액_(100000, 3, 사용회수, 사용금액);
    합 += 금액;
    사용회수++;
    사용금액 += 금액;
    Logger.log('   ' + (i + 1) + '회차 = ' + 금액);
  }
  Logger.log('4. 회차 합계: ' + 합 + ' (100000이어야 정상 — 마지막 회차 나머지 보정)');

  var ctx = MULT_검증컨텍스트_('H003');

  Logger.log('5. 정상 사용: ' +
    (MULT_사용오류_(ctx, 대상.다회차ID, '9999999', 시술명) === null ? '통과' : '★ 차단됨'));

  var 다른시술 = BASE_값목록_('H003', '시술명')[1] || '없는시술';
  Logger.log('6. 다른 시술 사용: ' +
    (MULT_사용오류_(ctx, 대상.다회차ID, '9999999', 다른시술) !== null ? '정상 차단' : '★ 통과됨'));

  Logger.log('7. 타 환자: ' +
    (MULT_사용오류_(ctx, 대상.다회차ID, '1111', 시술명) !== null ? '정상 차단' : '★ 통과됨'));

  MULT_사용오류_(ctx, 대상.다회차ID, '9999999', 시술명);
  MULT_사용오류_(ctx, 대상.다회차ID, '9999999', 시술명);
  Logger.log('8. 4회차 초과(누적): ' +
    (MULT_사용오류_(ctx, 대상.다회차ID, '9999999', 시술명) !== null ? '정상 차단' : '★ 통과됨'));

  MULT_상태변경(token, 대상.다회차ID, MULT_상태_종료);

  Logger.log('9. 종료 처리: 기본 목록 잔존 ' +
    MULT_getList(token, {}).filter(function(m) {
      return m.다회차ID === 대상.다회차ID;
    }).length + '건 (0이어야 정상)');

  Logger.log('10. 정리: 테스트 다회차를 종료 상태로 남김 (' + 대상.다회차ID + ').');
  Logger.log('    시트에서 직접 삭제하십시오.');

  AUTH_logout(token);

  Logger.log('=== 다회차 전체흐름 테스트 종료 ===');
}
