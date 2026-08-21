// =====================================================================
// Order.gs — 발주 도메인 서버 함수 (ORDER_*)
//
// - 대상 시트: 07_발주 / 08_발주품목
// - 거래처 1곳 = 발주서 1장 (07_발주가 거래처ID 를 하나만 갖는다)
// - 발주상태: 발주 → 부분입고 → 완료 / 취소 (부분입고 이후에는 취소 불가)
// - ★ 입수량은 라인 값이다 (2026-08-21 사용자 확정).
//   "같은 품목인데 입고될 때마다 포장(개입 수)이 달라지는 제품이 은근 많다"
//   → 품목 마스터의 규격(100ea/box)은 기본값일 뿐이고,
//     발주 라인의 입수량이 그 회차의 환산이다 (이카운트 입수량 방식 참고).
//   낱개수량은 저장하지 않는다 = 발주수량 × 입수량 (잔여 미저장 원칙과 동일)
// - 단가는 그 품목의 직전 발주 단가를 자동으로 채우고 수정할 수 있다.
//   금액 = 발주수량 × 단가는 서버가 계산한다 (파생값은 서버가 기록)
// - ID 채번: 발주 O000001 / 발주품목 Q000001 (§3-2 새 접두사)
// =====================================================================


// =====================================================================
// 헤더 정본
// =====================================================================

var ORDER_헤더 = [
  '발주ID', '병원ID', '거래처ID', '발주일', '요청자ID',
  '발주상태', '비고', '등록일시', '수정일시'
];

// 15열. 기존 14열에 '입수량'(단위 다음)을 추가했다 (2026-08-21, 0행일 때 교체)
// 발주수량·입고수량·미입고수량은 전부 발주 단위(box 등) 기준이다.
// 낱개 환산은 입수량을 곱해서 계산한다 (저장 안 함)
var ORDER_품목헤더 = [
  '발주품목ID', '병원ID', '발주ID', '품목ID', '발주수량',
  '단위', '입수량', '단가', '금액', '입고수량', '미입고수량',
  '상태', '비고', '등록일시', '수정일시'
];

var ORDER_상태목록 = ['발주', '부분입고', '완료', '취소'];


// =====================================================================
// 내부 헬퍼
// =====================================================================

function ORDER_세션확인_(token) {

  var session = AUTH_getSession(token);

  if (!session || !session.병원ID) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  return session;
}


function ORDER_새ID목록_(접두사, 테이블, ID필드, 개수) {

  var 최대 = 0;

  DB_getAll(테이블).forEach(function(row) {
    var m = String(row[ID필드] || '').match(/^[A-Z](\d+)$/);
    if (m) {
      최대 = Math.max(최대, Number(m[1]));
    }
  });

  var 결과 = [];

  for (var i = 1; i <= 개수; i++) {
    결과.push(접두사 + ('000000' + (최대 + i)).slice(-6));
  }

  return 결과;
}


/* 규격 문자열(100ea/box) → { 입수량, 사용단위, 발주단위 } | null.
   형식이 아니면 null (환산 1:1 취급) */
function ORDER_규격파싱_(규격) {

  var m = String(규격 || '').trim()
    .match(/^(\d+)\s*([A-Za-z가-힣]+)\s*\/\s*([A-Za-z가-힣]+)$/);

  if (!m) {
    return null;
  }

  return {
    입수량: Number(m[1]),
    사용단위: m[2],
    발주단위: m[3]
  };
}


function ORDER_수량정규화_(값, 이름) {

  var n = Number(String(값 === null || 값 === undefined ? '' : 값).replace(/,/g, ''));

  if (isNaN(n) || n <= 0) {
    throw new Error(이름 + '은(는) 0보다 큰 숫자여야 합니다.');
  }

  return n;
}


// =====================================================================
// 발주 작성 화면용 데이터 (한 번에 내려 왕복을 줄인다)
// =====================================================================

function ORDER_작성데이터(token) {

  var session = ORDER_세션확인_(token);

  // 거래처: 거래중만
  var 거래처들 = DB_getAll('거래처')
    .filter(function(row) {
      return String(row['병원ID']) === session.병원ID &&
             String(row['거래여부']).toLowerCase() !== 'false';
    })
    .map(function(row) {
      return {
        거래처ID: String(row['거래처ID']),
        거래처명: String(row['거래처명'] || '')
      };
    })
    .sort(function(a, b) { return a.거래처명.localeCompare(b.거래처명, 'ko'); });

  // 품목: 사용중만. 규격에서 입수량 기본값을 미리 파싱해 내린다
  var 품목들 = DB_getAll('품목')
    .filter(function(row) {
      return String(row['병원ID']) === session.병원ID &&
             String(row['사용여부']).toLowerCase() !== 'false';
    })
    .map(function(row) {
      var 파싱 = ORDER_규격파싱_(row['규격']);
      return {
        품목ID: String(row['품목ID']),
        품목명: String(row['품목명'] || ''),
        분류: String(row['분류'] || ''),
        단위: String(row['단위'] || ''),
        규격: String(row['규격'] || ''),
        입수량기본: 파싱 ? 파싱.입수량 : 1,
        발주단위기본: 파싱 ? 파싱.발주단위 : String(row['단위'] || ''),
        재고관리: String(row['재고관리']).toLowerCase() !== 'false'
      };
    })
    .sort(function(a, b) { return a.품목명.localeCompare(b.품목명, 'ko'); });

  // 직전 단가: 취소 제외 최신 발주품목 기준 (등록일시 내림차순 첫 값)
  var 직전단가 = {};

  DB_getAll('발주품목')
    .filter(function(row) {
      return String(row['병원ID']) === session.병원ID &&
             String(row['상태']) !== '취소';
    })
    .sort(function(a, b) {
      return new Date(a['등록일시']) - new Date(b['등록일시']);
    })
    .forEach(function(row) {
      // 나중 것이 덮어써서 최종적으로 최신 단가가 남는다
      직전단가[String(row['품목ID'])] = {
        단가: Number(row['단가']) || 0,
        입수량: Number(row['입수량']) || 1,
        단위: String(row['단위'] || '')
      };
    });

  return { 거래처들: 거래처들, 품목들: 품목들, 직전단가: 직전단가 };
}


// =====================================================================
// 발주 등록
//
// data: {
//   거래처ID(필수), 발주일(필수), 비고,
//   품목들: [{ 품목ID(필수), 발주수량(필수), 단위, 입수량, 단가(필수), 비고 }]
// }
// =====================================================================

function ORDER_add(token, data) {

  var session = ORDER_세션확인_(token);

  data = data || {};

  var 거래처ID = String(data.거래처ID || '').trim();
  var 발주일 = PROC_날짜문자열_(data.발주일);

  if (!거래처ID) {
    throw new Error('거래처를 선택해주세요.');
  }

  if (!발주일) {
    throw new Error('발주일을 입력해주세요.');
  }

  var 거래처 = DB_findById('거래처', '거래처ID', 거래처ID);

  if (!거래처 || String(거래처['병원ID']) !== session.병원ID) {
    throw new Error('거래처를 찾을 수 없습니다: ' + 거래처ID);
  }

  if (String(거래처['거래여부']).toLowerCase() === 'false') {
    throw new Error('거래종료된 거래처입니다: ' + String(거래처['거래처명']));
  }

  var 라인들 = Array.isArray(data.품목들) ? data.품목들 : [];

  if (라인들.length === 0) {
    throw new Error('발주할 품목을 1개 이상 입력해주세요.');
  }

  // ---- 라인 검증 (전부 통과해야 저장한다 — 부분 저장 없음) ----

  var 검증된 = 라인들.map(function(라인, i) {

    var 위치 = (i + 1) + '번 품목: ';
    var 품목ID = String(라인.품목ID || '').trim();

    if (!품목ID) {
      throw new Error(위치 + '품목을 선택해주세요.');
    }

    var 품목 = DB_findById('품목', '품목ID', 품목ID);

    if (!품목 || String(품목['병원ID']) !== session.병원ID) {
      throw new Error(위치 + '품목을 찾을 수 없습니다: ' + 품목ID);
    }

    if (String(품목['사용여부']).toLowerCase() === 'false') {
      throw new Error(위치 + '사용중지된 품목입니다: ' + String(품목['품목명']));
    }

    var 발주수량 = ORDER_수량정규화_(라인.발주수량, 위치 + '발주수량');

    // 입수량: 비어 있으면 1 (낱개 그대로). 라인 값이 그 회차의 환산이다
    var 입수량 = String(라인.입수량 === null || 라인.입수량 === undefined ? '' : 라인.입수량).trim();
    입수량 = 입수량 === '' ? 1 : ORDER_수량정규화_(입수량, 위치 + '입수량');

    var 단가 = Number(String(라인.단가 === null || 라인.단가 === undefined ? '' : 라인.단가).replace(/,/g, ''));

    if (isNaN(단가) || 단가 < 0) {
      throw new Error(위치 + '단가는 0 이상의 숫자여야 합니다.');
    }

    return {
      품목ID: 품목ID,
      발주수량: 발주수량,
      단위: String(라인.단위 || 품목['단위'] || '').trim(),
      입수량: 입수량,
      단가: 단가,
      금액: 발주수량 * 단가,        // 서버가 계산 (프론트 값 무시)
      비고: String(라인.비고 || '').trim()
    };
  });

  // ---- 저장 ----

  var 발주ID = ORDER_새ID목록_('O', '발주', '발주ID', 1)[0];
  var 품목ID들 = ORDER_새ID목록_('Q', '발주품목', '발주품목ID', 검증된.length);
  var 지금 = new Date();

  DB_insert('발주', {
    발주ID: 발주ID,
    병원ID: session.병원ID,
    거래처ID: 거래처ID,
    발주일: 발주일,
    요청자ID: String(session.사용자ID || ''),
    발주상태: '발주',
    비고: String(data.비고 || '').trim(),
    등록일시: 지금,
    수정일시: 지금
  });

  DB_insertMany('발주품목', 검증된.map(function(라인, i) {
    return {
      발주품목ID: 품목ID들[i],
      병원ID: session.병원ID,
      발주ID: 발주ID,
      품목ID: 라인.품목ID,
      발주수량: 라인.발주수량,
      단위: 라인.단위,
      입수량: 라인.입수량,
      단가: 라인.단가,
      금액: 라인.금액,
      입고수량: 0,
      미입고수량: 라인.발주수량,
      상태: '발주',
      비고: 라인.비고,
      등록일시: 지금,
      수정일시: 지금
    };
  }));

  return { success: true, 발주ID: 발주ID, 품목수: 검증된.length };
}


// =====================================================================
// 발주 목록 (품목수·총액 요약 포함)
// =====================================================================

function ORDER_getList(token, 조건) {

  var session = ORDER_세션확인_(token);

  조건 = 조건 || {};

  var 취소포함 = 조건.취소포함 === true;

  // 발주품목을 발주ID 로 묶어 요약
  var 요약 = {};

  DB_getAll('발주품목').forEach(function(row) {

    if (String(row['병원ID']) !== session.병원ID) {
      return;
    }

    var id = String(row['발주ID']);

    if (!요약[id]) {
      요약[id] = { 품목수: 0, 총액: 0 };
    }

    요약[id].품목수++;
    요약[id].총액 += Number(row['금액']) || 0;
  });

  var 거래처명 = {};

  DB_getAll('거래처').forEach(function(row) {
    거래처명[String(row['거래처ID'])] = String(row['거래처명'] || '');
  });

  return DB_getAll('발주')
    .filter(function(row) {

      if (String(row['병원ID']) !== session.병원ID) {
        return false;
      }

      if (!취소포함 && String(row['발주상태']) === '취소') {
        return false;
      }

      return true;
    })
    .map(function(row) {

      var id = String(row['발주ID']);
      var s = 요약[id] || { 품목수: 0, 총액: 0 };

      return {
        발주ID: id,
        거래처ID: String(row['거래처ID']),
        거래처명: 거래처명[String(row['거래처ID'])] || '(미확인)',
        발주일: PROC_날짜문자열_(row['발주일']),
        발주상태: String(row['발주상태'] || ''),
        비고: String(row['비고'] || ''),
        품목수: s.품목수,
        총액: s.총액
      };
    })
    .sort(function(a, b) {
      // 최신이 위로
      return b.발주ID.localeCompare(a.발주ID);
    });
}


// =====================================================================
// 발주 상세 (라인 목록)
// =====================================================================

function ORDER_상세(token, 발주ID) {

  var session = ORDER_세션확인_(token);

  var 발주 = DB_findById('발주', '발주ID', 발주ID);

  if (!발주 || String(발주['병원ID']) !== session.병원ID) {
    throw new Error('발주를 찾을 수 없습니다: ' + 발주ID);
  }

  var 품목명 = {};

  DB_getAll('품목').forEach(function(row) {
    품목명[String(row['품목ID'])] = String(row['품목명'] || '');
  });

  var 거래처 = DB_findById('거래처', '거래처ID', String(발주['거래처ID']));

  var 라인들 = DB_findWhere('발주품목', { 발주ID: String(발주ID) })
    .map(function(row) {

      var 발주수량 = Number(row['발주수량']) || 0;
      var 입수량 = Number(row['입수량']) || 1;

      return {
        발주품목ID: String(row['발주품목ID']),
        품목ID: String(row['품목ID']),
        품목명: 품목명[String(row['품목ID'])] || '(미확인)',
        발주수량: 발주수량,
        단위: String(row['단위'] || ''),
        입수량: 입수량,
        낱개수량: 발주수량 * 입수량,     // 저장 안 함 — 계산
        단가: Number(row['단가']) || 0,
        금액: Number(row['금액']) || 0,
        입고수량: Number(row['입고수량']) || 0,
        미입고수량: Number(row['미입고수량']) || 0,
        상태: String(row['상태'] || ''),
        비고: String(row['비고'] || '')
      };
    })
    .sort(function(a, b) { return a.발주품목ID.localeCompare(b.발주품목ID); });

  return {
    발주ID: String(발주['발주ID']),
    거래처ID: String(발주['거래처ID']),
    거래처명: 거래처 ? String(거래처['거래처명']) : '(미확인)',
    발주일: PROC_날짜문자열_(발주['발주일']),
    발주상태: String(발주['발주상태'] || ''),
    비고: String(발주['비고'] || ''),
    품목들: 라인들
  };
}


// =====================================================================
// 발주 취소 — 상태 '발주' 일 때만 (입고가 시작되면 입고부터 정리해야 한다)
// =====================================================================

function ORDER_취소(token, 발주ID) {

  var session = ORDER_세션확인_(token);

  var 발주 = DB_findById('발주', '발주ID', 발주ID);

  if (!발주 || String(발주['병원ID']) !== session.병원ID) {
    throw new Error('발주를 찾을 수 없습니다: ' + 발주ID);
  }

  var 상태 = String(발주['발주상태']);

  if (상태 === '취소') {
    throw new Error('이미 취소된 발주입니다.');
  }

  if (상태 !== '발주') {
    throw new Error('입고가 시작된 발주는 취소할 수 없습니다. (현재 상태: ' + 상태 + ')');
  }

  DB_updateById('발주', '발주ID', 발주ID, {
    발주상태: '취소',
    수정일시: new Date()
  });

  // 라인도 전부 취소로
  DB_findWhere('발주품목', { 발주ID: String(발주ID) }).forEach(function(row) {
    DB_updateById('발주품목', '발주품목ID', String(row['발주품목ID']), {
      상태: '취소',
      수정일시: new Date()
    });
  });

  return { success: true };
}


// =====================================================================
// 08_발주품목 시트재구성 — '입수량' 컬럼 도입 (2026-08-21)
//
// 데이터가 0행일 때만 헤더를 새 정의로 교체한다.
// 데이터가 있으면 중단 (수동 확인 필요). 이미 새 구조면 아무것도 안 한다.
// 편집기에서 1회 실행
// =====================================================================

function ORDER_시트재구성() {

  var ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  var sheet = ss.getSheetByName('08_발주품목');

  if (!sheet) {
    sheet = ss.insertSheet('08_발주품목');
  }

  var lastCol = sheet.getLastColumn();
  var 기존헤더 = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String)
    : [];

  if (기존헤더.join('|') === ORDER_품목헤더.join('|')) {
    Logger.log('08_발주품목 이미 새 구조 (15열). 변경 없음.');
    return;
  }

  if (sheet.getLastRow() > 1) {
    Logger.log('★ 08_발주품목에 데이터가 있습니다. 수동 확인 필요 — 변경하지 않음.');
    return;
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, ORDER_품목헤더.length).setValues([ORDER_품목헤더]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, ORDER_품목헤더.length).setFontWeight('bold');

  SpreadsheetApp.flush();
  DB_캐시비우기('발주품목');

  Logger.log('08_발주품목 헤더 교체 완료 (15열, 입수량 추가).');
}
