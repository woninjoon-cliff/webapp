// =====================================================================
// Membership.gs — 회원권 도메인 서버 함수 (MEMB_*)
//
// - 대상 시트: 15_회원권 (12열)
// - 채번: K000001 (전 병원 통합). 기존 접두사 H·U·P·M·S·B·V 와 겹치지 않게 K
// - 모든 공개 함수는 첫 인자로 세션 토큰을 받는다
// - 병원별 데이터 분리: 세션 병원ID로 필터·검증
// - 물리 삭제 없음: 상태 = '종료' (논리 삭제)
//
// ★ 잔액은 저장하지 않고 매번 계산한다 (2026-08-21 확정)
//   사용액 = 05_시술에서 회원권ID가 일치하고 상태가 '취소'가 아닌 행의 시술금액 합
//   잔액   = 총액 - 사용액
//   저장해두면 시술을 취소·수정할 때마다 되돌려야 하고 한 번 어긋나면
//   맞추기 어렵다. 계산 방식이면 시술 취소 시 잔액이 자동으로 복구된다.
//
// ★ 매출 인식은 기존 방침 유지 (인수인계 §4-4)
//   회원권 = 시술 시 인식. 판매 시점은 선수금이며 매출이 아니다.
//   따라서 15_회원권의 총액은 대시보드·병원 관리 매출 집계에 넣지 않는다.
// =====================================================================


var MEMB_상태_사용중 = '사용중';
var MEMB_상태_종료 = '종료';

var MEMB_헤더 = [
  '회원권ID',
  '병원ID',
  '환자번호',
  '환자명',
  '상품명',
  '판매일',
  '총액',
  '유효기간',
  '상태',
  '비고',
  '등록일시',
  '수정일시'
];


// =====================================================================
// 내부 헬퍼
// =====================================================================

function MEMB_세션확인_(token) {

  var session = AUTH_getSession(token);

  if (!session || !session.병원ID) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  return session;
}


function MEMB_새ID목록_(개수) {

  var rows = DB_getAll('회원권');
  var max = 0;

  rows.forEach(function(row) {

    var id = String(row['회원권ID'] || '');

    if (id.charAt(0) === 'K') {
      var n = parseInt(id.substring(1), 10);
      if (!isNaN(n) && n > max) {
        max = n;
      }
    }
  });

  var list = [];

  for (var i = 1; i <= 개수; i++) {
    list.push('K' + ('000000' + (max + i)).slice(-6));
  }

  return list;
}


// 회원권ID → 사용액 (취소 제외). 05_시술을 1회만 훑는다
function MEMB_사용액맵_(병원ID) {

  var 맵 = {};

  DB_findWhere('시술', { 병원ID: 병원ID }).forEach(function(row) {

    if (String(row['상태']) === PROC_상태_취소) {
      return;
    }

    var 권ID = String(row['회원권ID'] || '').trim();

    if (권ID === '') {
      return;
    }

    맵[권ID] = (맵[권ID] || 0) + (Number(row['시술금액']) || 0);
  });

  return 맵;
}


// 시트 행 → 화면용 객체 (잔액 계산 포함)
function MEMB_행변환_(row, 사용액맵) {

  var id = String(row['회원권ID'] || '');
  var 총액 = Number(row['총액']) || 0;
  var 사용액 = 사용액맵[id] || 0;
  var 유효기간 = PROC_날짜문자열_(row['유효기간']);
  var 상태 = String(row['상태'] || MEMB_상태_사용중);

  var 오늘 = PROC_날짜문자열_(new Date());
  var 만료됨 = 유효기간 !== '' && 유효기간 < 오늘;

  return {
    회원권ID: id,
    환자번호: String(row['환자번호'] || ''),
    환자명: String(row['환자명'] || ''),
    상품명: String(row['상품명'] || ''),
    판매일: PROC_날짜문자열_(row['판매일']),
    총액: 총액,
    사용액: 사용액,
    잔액: 총액 - 사용액,
    유효기간: 유효기간,
    상태: 상태,
    만료됨: 만료됨,
    // 실제로 차감에 쓸 수 있는지. 화면 표시와 서버 검증이 같은 기준을 쓴다
    사용가능: 상태 === MEMB_상태_사용중 && !만료됨 && (총액 - 사용액) > 0,
    비고: String(row['비고'] || '')
  };
}


// =====================================================================
// 목록 조회
// 조건: { 종료포함: true|false, 환자번호: '...' }
// =====================================================================

function MEMB_getList(token, 조건) {

  var session = MEMB_세션확인_(token);

  조건 = 조건 || {};

  var 종료포함 = 조건.종료포함 === true;
  var 환자번호 = String(조건.환자번호 || '').trim();

  var 사용액맵 = MEMB_사용액맵_(session.병원ID);

  var 목록 = DB_findWhere('회원권', { 병원ID: session.병원ID })
    .map(function(row) {
      return MEMB_행변환_(row, 사용액맵);
    })
    .filter(function(m) {

      if (!종료포함 && m.상태 === MEMB_상태_종료) {
        return false;
      }

      if (환자번호 !== '' && m.환자번호.indexOf(환자번호) === -1) {
        return false;
      }

      return true;
    });

  // 판매일 내림차순 → 회원권ID 내림차순
  목록.sort(function(a, b) {

    if (a.판매일 !== b.판매일) {
      return a.판매일 < b.판매일 ? 1 : -1;
    }

    return a.회원권ID < b.회원권ID ? 1 : -1;
  });

  return 목록;
}


// =====================================================================
// 특정 환자의 사용 가능한 회원권 (시술 등록 드롭다운용)
// =====================================================================

function MEMB_사용가능목록(token, 환자번호) {

  var session = MEMB_세션확인_(token);

  var 번호 = String(환자번호 || '').trim();

  if (번호 === '') {
    return [];
  }

  var 사용액맵 = MEMB_사용액맵_(session.병원ID);

  return DB_findWhere('회원권', { 병원ID: session.병원ID, 환자번호: 번호 })
    .map(function(row) {
      return MEMB_행변환_(row, 사용액맵);
    })
    .filter(function(m) {
      return m.사용가능;
    });
}


// =====================================================================
// 사용 내역 (상세 팝업용) — 이 회원권으로 차감된 시술 목록
// =====================================================================

function MEMB_사용내역(token, 회원권ID) {

  var session = MEMB_세션확인_(token);

  var id = String(회원권ID || '').trim();

  if (id === '') {
    return [];
  }

  return DB_findWhere('시술', { 병원ID: session.병원ID })
    .filter(function(row) {
      return String(row['회원권ID'] || '').trim() === id;
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
// data: { 환자번호(필수), 환자명, 상품명(필수), 판매일(필수), 총액(필수),
//         유효기간, 비고 }
// =====================================================================

function MEMB_add(token, data) {

  var session = MEMB_세션확인_(token);

  data = data || {};

  var 환자번호 = String(data.환자번호 || '').trim();
  var 상품명 = String(data.상품명 || '').trim();
  var 판매일 = PROC_날짜문자열_(data.판매일 || '');
  var 총액 = PROC_금액정규화_(data.총액);

  if (환자번호 === '') {
    throw new Error('환자번호를 입력해주세요.');
  }

  if (상품명 === '') {
    throw new Error('상품명을 입력해주세요.');
  }

  if (판매일 === '') {
    throw new Error('판매일을 입력해주세요.');
  }

  if (총액 <= 0) {
    throw new Error('총액은 0보다 커야 합니다.');
  }

  var 유효기간 = PROC_날짜문자열_(data.유효기간 || '');

  if (유효기간 !== '' && 유효기간 < 판매일) {
    throw new Error('유효기간이 판매일보다 빠릅니다.');
  }

  var 지금 = new Date();

  DB_insertMany('회원권', [{
    회원권ID: MEMB_새ID목록_(1)[0],
    병원ID: session.병원ID,
    환자번호: 환자번호,
    환자명: String(data.환자명 || '').trim(),
    상품명: 상품명,
    판매일: 판매일,
    총액: 총액,
    유효기간: 유효기간,
    상태: MEMB_상태_사용중,
    비고: String(data.비고 || '').trim(),
    등록일시: 지금,
    수정일시: 지금
  }]);

  return { success: true, 환자번호: 환자번호, 상품명: 상품명 };
}


// =====================================================================
// 수정
// ★ 총액을 이미 사용한 금액보다 작게 줄일 수 없다 (잔액이 음수가 된다)
// =====================================================================

function MEMB_update(token, data) {

  var session = MEMB_세션확인_(token);

  data = data || {};

  var id = String(data.회원권ID || '').trim();

  if (id === '') {
    throw new Error('회원권ID가 없습니다.');
  }

  var 기존 = DB_findById('회원권', '회원권ID', id);

  if (!기존) {
    throw new Error('회원권을 찾을 수 없습니다: ' + id);
  }

  if (String(기존['병원ID']) !== String(session.병원ID)) {
    throw new Error('다른 병원의 회원권은 수정할 수 없습니다.');
  }

  var 상품명 = String(data.상품명 || '').trim();
  var 판매일 = PROC_날짜문자열_(data.판매일 || '');
  var 총액 = PROC_금액정규화_(data.총액);

  if (상품명 === '') {
    throw new Error('상품명을 입력해주세요.');
  }

  if (판매일 === '') {
    throw new Error('판매일을 입력해주세요.');
  }

  var 사용액 = MEMB_사용액맵_(session.병원ID)[id] || 0;

  if (총액 < 사용액) {
    throw new Error(
      '총액을 이미 사용한 금액보다 작게 줄일 수 없습니다. ' +
      '사용액 ' + 사용액.toLocaleString('ko-KR') + '원'
    );
  }

  var 유효기간 = PROC_날짜문자열_(data.유효기간 || '');

  if (유효기간 !== '' && 유효기간 < 판매일) {
    throw new Error('유효기간이 판매일보다 빠릅니다.');
  }

  DB_updateById('회원권', '회원권ID', id, {
    환자명: String(data.환자명 || '').trim(),
    상품명: 상품명,
    판매일: 판매일,
    총액: 총액,
    유효기간: 유효기간,
    비고: String(data.비고 || '').trim(),
    수정일시: new Date()
  });

  return { success: true };
}


// =====================================================================
// 상태 변경 (사용중 ↔ 종료). 물리 삭제 대신 쓴다
// =====================================================================

function MEMB_상태변경(token, 회원권ID, 상태) {

  var session = MEMB_세션확인_(token);

  var id = String(회원권ID || '').trim();
  var 새상태 = String(상태 || '').trim();

  if (새상태 !== MEMB_상태_사용중 && 새상태 !== MEMB_상태_종료) {
    throw new Error('상태가 올바르지 않습니다: ' + 새상태);
  }

  var 기존 = DB_findById('회원권', '회원권ID', id);

  if (!기존) {
    throw new Error('회원권을 찾을 수 없습니다: ' + id);
  }

  if (String(기존['병원ID']) !== String(session.병원ID)) {
    throw new Error('다른 병원의 회원권은 수정할 수 없습니다.');
  }

  DB_updateById('회원권', '회원권ID', id, {
    상태: 새상태,
    수정일시: new Date()
  });

  return { success: true };
}


// =====================================================================
// 시술 저장용 검증 (Procedure.gs 에서 호출)
//
// 구분이 '회원권'인 행에 대해 회원권ID의 유효성과 잔액을 검사한다.
// ctx = MEMB_검증컨텍스트_(병원ID) 를 한 번 만들어 행마다 재사용한다
// (행마다 시트를 다시 읽으면 배치 저장이 매우 느려진다).
//
// 반환: 오류 문구 또는 null
// =====================================================================

function MEMB_검증컨텍스트_(병원ID) {

  var 사용액맵 = MEMB_사용액맵_(병원ID);
  var 맵 = {};

  DB_findWhere('회원권', { 병원ID: 병원ID }).forEach(function(row) {
    var m = MEMB_행변환_(row, 사용액맵);
    맵[m.회원권ID] = m;
  });

  return { 회원권맵: 맵, 누적: {} };
}


function MEMB_사용오류_(ctx, 회원권ID, 환자번호, 금액) {

  var id = String(회원권ID || '').trim();

  if (id === '') {
    return '시술구분이 회원권이면 사용할 회원권을 선택해야 합니다.';
  }

  var m = ctx.회원권맵[id];

  if (!m) {
    return '회원권 "' + id + '"을(를) 찾을 수 없습니다.';
  }

  if (String(m.환자번호) !== String(환자번호 || '').trim()) {
    return '회원권 "' + id + '"은(는) 환자번호 ' + m.환자번호 +
      ' 의 것입니다. 이 시술의 환자번호와 다릅니다.';
  }

  if (m.상태 === MEMB_상태_종료) {
    return '회원권 "' + id + '"은(는) 종료된 회원권입니다.';
  }

  if (m.만료됨) {
    return '회원권 "' + id + '"은(는) 유효기간이 지났습니다 (' + m.유효기간 + ').';
  }

  // 같은 배치 안에서 여러 행이 같은 회원권을 쓰면 누적해서 검사해야 한다
  var 이미 = ctx.누적[id] || 0;
  var 남은 = m.잔액 - 이미;

  if ((Number(금액) || 0) > 남은) {
    return '회원권 잔액이 부족합니다. 잔액 ' + 남은.toLocaleString('ko-KR') +
      '원 / 시술금액 ' + (Number(금액) || 0).toLocaleString('ko-KR') + '원';
  }

  ctx.누적[id] = 이미 + (Number(금액) || 0);

  return null;
}


// =====================================================================
// 시술 수정용 검증 (Procedure.gs PROC_update 에서 호출)
//
// ★ 수정은 저장과 다르다. 그 시술이 이미 차감하고 있는 금액을 되돌려 놓고
//   새 금액을 검사해야 한다. 안 그러면 자기 자신을 두 번 빼서
//   금액을 그대로 두고 저장해도 "잔액 부족"이 난다.
//
// 기존금액 = 수정 전 시술금액 (그 시술이 취소 상태였다면 0을 넘길 것)
// 반환: 오류 문구 또는 null
// =====================================================================

function MEMB_수정오류_(병원ID, 회원권ID, 환자번호, 새금액, 기존금액) {

  var id = String(회원권ID || '').trim();

  if (id === '') {
    return '시술구분이 회원권이면 사용할 회원권을 선택해야 합니다.';
  }

  var row = DB_findById('회원권', '회원권ID', id);

  if (!row || String(row['병원ID']) !== String(병원ID)) {
    return '회원권 "' + id + '"을(를) 찾을 수 없습니다.';
  }

  var m = MEMB_행변환_(row, MEMB_사용액맵_(병원ID));

  if (String(m.환자번호) !== String(환자번호 || '').trim()) {
    return '회원권 "' + id + '"은(는) 환자번호 ' + m.환자번호 +
      ' 의 것입니다. 이 시술의 환자번호와 다릅니다.';
  }

  if (m.상태 === MEMB_상태_종료) {
    return '회원권 "' + id + '"은(는) 종료된 회원권입니다.';
  }

  if (m.만료됨) {
    return '회원권 "' + id + '"은(는) 유효기간이 지났습니다 (' + m.유효기간 + ').';
  }

  // 자기 자신의 기존 차감분을 되돌린 가용 잔액
  var 가용 = m.잔액 + (Number(기존금액) || 0);

  if ((Number(새금액) || 0) > 가용) {
    return '회원권 잔액이 부족합니다. 이 시술을 제외한 잔액 ' +
      가용.toLocaleString('ko-KR') + '원 / 시술금액 ' +
      (Number(새금액) || 0).toLocaleString('ko-KR') + '원';
  }

  return null;
}


// =====================================================================
// 테스트 (편집기에서 수동 실행, Logger 확인)
// 등록 → 조회 → 잔액 → 수정 차단 → 상태변경 순으로 확인한다.
// ★ 테스트 회원권 1건이 남는다. 확인 후 시트에서 직접 삭제할 것
//   (test_VENDOR_전체흐름 과 동일한 성격 — 인수인계 §5-7)
// =====================================================================

function test_MEMB_전체흐름() {

  Logger.log('=== 회원권 전체흐름 테스트 시작 ===');

  var 사용자 = DB_findWhere('사용자', { 병원ID: 'H003', 아이디: 'joon' })[0];

  if (!사용자) {
    Logger.log('★ H003 joon 사용자를 찾을 수 없습니다.');
    return;
  }

  var token = AUTH_createSession(사용자);
  var 표식 = '__테스트회원권__' + new Date().getTime();

  MEMB_add(token, {
    환자번호: '9999999',
    환자명: '테스트환자',
    상품명: 표식,
    판매일: PROC_날짜문자열_(new Date()),
    총액: 1000000,
    비고: '자동 테스트'
  });

  var 목록 = MEMB_getList(token, {});
  var 대상 = 목록.filter(function(m) { return m.상품명 === 표식; })[0];

  if (!대상) {
    Logger.log('★ 1. 등록 실패 — 목록에서 찾을 수 없음');
    return;
  }

  Logger.log('1. 등록: ' + 대상.회원권ID + ' / 총액 ' + 대상.총액);
  Logger.log('2. 잔액 계산: 사용액 ' + 대상.사용액 + ' / 잔액 ' + 대상.잔액 +
    ' (사용 이력이 없으므로 총액과 같아야 정상)');
  Logger.log('3. 사용가능 판정: ' + 대상.사용가능 + ' (true여야 정상)');

  var ctx = MEMB_검증컨텍스트_('H003');

  Logger.log('4. 잔액 내 사용: ' +
    (MEMB_사용오류_(ctx, 대상.회원권ID, '9999999', 300000) === null
      ? '통과' : '★ 차단됨'));

  Logger.log('5. 잔액 초과(누적 800000 시도): ' +
    (MEMB_사용오류_(ctx, 대상.회원권ID, '9999999', 800000) !== null
      ? '정상 차단' : '★ 통과됨 — 누적 검사 실패'));

  Logger.log('6. 타 환자 사용: ' +
    (MEMB_사용오류_(ctx, 대상.회원권ID, '1111', 10000) !== null
      ? '정상 차단' : '★ 통과됨'));

  try {
    MEMB_update(token, {
      회원권ID: 대상.회원권ID,
      상품명: 표식,
      판매일: 대상.판매일,
      총액: 1000
    });
    Logger.log('7. 총액 축소 차단: ★ 통과됨 (사용액 0이라 정상일 수 있음)');
  } catch (e) {
    Logger.log('7. 총액 축소 차단: 정상 차단 — ' + e.message);
  }

  MEMB_상태변경(token, 대상.회원권ID, MEMB_상태_종료);

  var 종료후 = MEMB_getList(token, {}).filter(function(m) {
    return m.회원권ID === 대상.회원권ID;
  });

  Logger.log('8. 종료 처리: 기본 목록 잔존 ' + 종료후.length + '건 (0이어야 정상)');
  Logger.log('9. 정리: 테스트 회원권을 종료 상태로 남김 (' + 대상.회원권ID + ').');
  Logger.log('   시트에서 직접 삭제하십시오.');

  AUTH_logout(token);

  Logger.log('=== 회원권 전체흐름 테스트 종료 ===');
}
