// =====================================================================
// DB_초기화.gs
// VIVICELL 새 웹앱 DB 초기 구조 생성
// =====================================================================

function DB_초기화() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheets = {
    '01_병원': [
      '병원ID',
      '병원명',
      '병원코드',
      '사용여부',
      '등록일시',
      '수정일시'
    ],

    '02_사용자': [
      '사용자ID',
      '병원ID',
      '아이디',
      '비밀번호해시',
      '이름',
      '권한',
      '사용여부',
      '마지막로그인',
      '등록일시',
      '수정일시'
    ],

    '03_품목': [
      '품목ID',
      '분류',
      '품목명',
      '단위',
      '사양',
      '사용여부',
      '등록일시',
      '수정일시'
    ],

    '04_거래처': [
      '거래처ID',
      '거래처명',
      '사업자번호',
      '대표자',
      '담당자',
      '전화번호',
      '이메일',
      '주소',
      '메모',
      '사용여부',
      '등록일시',
      '수정일시'
    ],

    '05_시술': [
      '시술ID',
      '등록묶음ID',
      '병원ID',
      '환자번호',
      '환자명',
      '시술일',
      '시술구분',
      '시술명',
      '담당원장',
      '담당자',
      '비고',
      '상태',
      '등록일시',
      '수정일시'
    ],

    '06_시술사용품목': [
      '사용ID',
      '시술ID',
      '품목ID',
      '사용수량',
      '단위',
      'LOTID',
      '단가',
      '원가',
      '비고',
      '등록일시',
      '수정일시'
    ],

    '07_발주': [
      '발주ID',
      '병원ID',
      '거래처ID',
      '발주일',
      '요청자ID',
      '발주상태',
      '비고',
      '등록일시',
      '수정일시'
    ],

    '08_발주품목': [
      '발주품목ID',
      '발주ID',
      '품목ID',
      '발주수량',
      '단위',
      '단가',
      '금액',
      '입고수량',
      '미입고수량',
      '상태',
      '비고',
      '등록일시',
      '수정일시'
    ],

    '09_입고': [
      '입고ID',
      '발주ID',
      '병원ID',
      '거래처ID',
      '입고일',
      '입고담당자ID',
      '입고상태',
      '비고',
      '등록일시',
      '수정일시'
    ],

    '10_입고품목': [
      '입고품목ID',
      '입고ID',
      '발주품목ID',
      '품목ID',
      'LOTID',
      '입고수량',
      '단위',
      '단가',
      '유효기간',
      '비고',
      '등록일시',
      '수정일시'
    ],

    '11_LOT': [
      'LOTID',
      '품목ID',
      'LOT번호',
      '입고ID',
      '입고품목ID',
      '거래처ID',
      '입고일',
      '유효기간',
      '초기수량',
      '현재수량',
      '단가',
      '상태',
      '등록일시',
      '수정일시'
    ],

    '12_재고이력': [
      '이력ID',
      '발생일시',
      '병원ID',
      '품목ID',
      'LOTID',
      '유형',
      '참조ID',
      '입고수량',
      '사용수량',
      '조정수량',
      '변경전재고',
      '변경후재고',
      '단가',
      '금액',
      '담당자ID',
      '비고'
    ],

    '13_시스템로그': [
      '로그ID',
      '발생일시',
      '사용자ID',
      '병원ID',
      '작업유형',
      '대상유형',
      '대상ID',
      '작업내용',
      '접속정보'
    ]
  };

  Object.entries(sheets).forEach(([sheetName, headers]) => {
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // 완전히 빈 새 시트에서만 초기화
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    if (lastRow === 0 || (lastRow === 1 && lastColumn === 1 && !sheet.getRange('A1').getValue())) {
      sheet.clear();

      sheet
        .getRange(1, 1, 1, headers.length)
        .setValues([headers]);

      sheet.setFrozenRows(1);

      sheet
        .getRange(1, 1, 1, headers.length)
        .setFontWeight('bold');

      sheet.autoResizeColumns(1, headers.length);
    }
  });

  // 기존 기본 시트 정리
  const defaultSheet = ss.getSheetByName('시트1');

  if (
    defaultSheet &&
    ss.getSheets().length > 1 &&
    defaultSheet.getLastRow() === 0 &&
    defaultSheet.getLastColumn() === 1
  ) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.flush();

  Logger.log('VIVICELL 새 웹앱 DB 초기화 완료');
}

// =====================================================================
// 품목 관리 — 조회 / 등록 / 수정 / 삭제
// =====================================================================

function ITEM_getList() {

  const ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('03_품목');

  if (!sheet) {
    throw new Error('03_품목 시트를 찾을 수 없습니다.');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 8)
    .getValues();

  return values
    .filter(function(row) {
      return row[0] !== '' || row[2] !== '';
    })
    .map(function(row) {

      return {
        품목ID: String(row[0] || ''),
        분류: String(row[1] || ''),
        품목명: String(row[2] || ''),
        단위: String(row[3] || ''),
        사양: String(row[4] || ''),
        사용여부: row[5] === true ||
                 String(row[5]).toLowerCase() !== 'false',

        // Date 객체를 문자열로 변환
        등록일시: row[6]
          ? Utilities.formatDate(
              new Date(row[6]),
              Session.getScriptTimeZone(),
              'yyyy-MM-dd HH:mm:ss'
            )
          : '',

        수정일시: row[7]
          ? Utilities.formatDate(
              new Date(row[7]),
              Session.getScriptTimeZone(),
              'yyyy-MM-dd HH:mm:ss'
            )
          : ''
      };

    });
}


// =====================================================================
// 품목 등록 / 수정
// =====================================================================

function ITEM_save(data) {

  if (!data) {
    throw new Error('품목 데이터가 없습니다.');
  }

  const ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('03_품목');

  if (!sheet) {
    throw new Error('03_품목 시트를 찾을 수 없습니다.');
  }

  const 품목명 =
    String(data.품목명 || '').trim();

  if (!품목명) {
    throw new Error('품목명을 입력해주세요.');
  }


  const 분류 =
    String(data.분류 || '').trim();

  const 사양 =
    String(data.사양 || '').trim();

  const 단위 =
    String(data.단위 || '').trim();

  const 사용여부 =
    data.사용여부 === false ||
    String(data.사용여부).toLowerCase() === 'false'
      ? false
      : true;


  const now = new Date();


  // ---------------------------------------------------------------
  // 수정
  // ---------------------------------------------------------------

  if (data.품목ID) {

    const lastRow =
      sheet.getLastRow();

    if (lastRow < 2) {
      throw new Error(
        '수정할 품목이 없습니다.'
      );
    }


    const ids =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          1
        )
        .getValues();


    let targetRow = -1;


    for (
      let i = 0;
      i < ids.length;
      i++
    ) {

      if (
        String(ids[i][0]) ===
        String(data.품목ID)
      ) {

        targetRow = i + 2;
        break;

      }

    }


    if (targetRow === -1) {

      throw new Error(
        '수정할 품목을 찾을 수 없습니다.'
      );

    }


    // 다른 품목과 품목명 중복 검사

    const rows =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          8
        )
        .getValues();


    for (
      let i = 0;
      i < rows.length;
      i++
    ) {

      const rowID =
        String(rows[i][0] || '');

      const rowName =
        String(rows[i][2] || '')
          .trim()
          .toLowerCase();


      if (
        rowID !== String(data.품목ID) &&
        rowName === 품목명.toLowerCase()
      ) {

        throw new Error(
          '이미 존재하는 품목명입니다: ' +
          품목명
        );

      }

    }


    // 컬럼 순서: 품목ID / 분류 / 품목명 / 단위 / 사양 / 사용여부 / 등록일시 / 수정일시
    // 품목ID(1열)는 유지, 2열(분류)~8열(수정일시) 갱신
    sheet
      .getRange(
        targetRow,
        2,
        1,
        7
      )
      .setValues([[
        분류,
        품목명,
        단위,
        사양,
        사용여부,
        rows[targetRow - 2][6] || now,
        now
      ]]);


    SpreadsheetApp.flush();

    return '품목 수정이 완료되었습니다.';

  }


  // ---------------------------------------------------------------
  // 신규 등록
  // ---------------------------------------------------------------

  const lastRow =
    sheet.getLastRow();


  // 품목명 중복 검사

  if (lastRow >= 2) {

    // 품목명은 3열
    const names =
      sheet
        .getRange(
          2,
          3,
          lastRow - 1,
          1
        )
        .getValues();


    for (
      let i = 0;
      i < names.length;
      i++
    ) {

      if (
        String(names[i][0] || '')
          .trim()
          .toLowerCase() ===
        품목명.toLowerCase()
      ) {

        throw new Error(
          '이미 존재하는 품목명입니다: ' +
          품목명
        );

      }

    }

  }


  const 품목ID =
    ITEM_새ID생성_();


  // 컬럼 순서: 품목ID / 분류 / 품목명 / 단위 / 사양 / 사용여부 / 등록일시 / 수정일시
  sheet.appendRow([

    품목ID,
    분류,
    품목명,
    단위,
    사양,
    사용여부,
    now,
    now

  ]);


  SpreadsheetApp.flush();


  return '품목 등록이 완료되었습니다.';

}


// =====================================================================
// 품목 ID 생성
// =====================================================================

function ITEM_새ID생성_() {

  const ss =
    SpreadsheetApp.openById(DB_SPREADSHEET_ID);

  const sheet =
    ss.getSheetByName('03_품목');

  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {
    return 'P000001';
  }


  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getValues();


  let maxNumber = 0;


  ids.forEach(function(row) {

    const id =
      String(row[0] || '')
        .trim();

    const match =
      id.match(/^P(\d+)$/i);


    if (match) {

      const number =
        Number(match[1]);

      if (number > maxNumber) {
        maxNumber = number;
      }

    }

  });


  return 'P' +
    String(maxNumber + 1)
      .padStart(6, '0');

}


// =====================================================================
// 품목 삭제
// =====================================================================

function ITEM_delete(품목ID) {

  const id =
    String(품목ID || '').trim();


  if (!id) {
    throw new Error(
      '삭제할 품목ID가 없습니다.'
    );
  }


  const ss =
    SpreadsheetApp.openById(DB_SPREADSHEET_ID);

  const sheet =
    ss.getSheetByName('03_품목');


  if (!sheet) {
    throw new Error(
      '03_품목 시트를 찾을 수 없습니다.'
    );
  }


  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {
    throw new Error(
      '삭제할 품목이 없습니다.'
    );
  }


  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getValues();


  let targetRow = -1;


  for (
    let i = 0;
    i < ids.length;
    i++
  ) {

    if (
      String(ids[i][0]) === id
    ) {

      targetRow = i + 2;
      break;

    }

  }


  if (targetRow === -1) {

    throw new Error(
      '삭제할 품목을 찾을 수 없습니다.'
    );

  }


  sheet.deleteRow(targetRow);

  SpreadsheetApp.flush();


  return '품목이 삭제되었습니다.';

}

// =====================================================================
// 품목 CRUD 통합 테스트 (등록→조회→수정→재조회→삭제)
// =====================================================================

function test_ITEM_전체흐름() {

  const 테스트품목명 = '__테스트품목__' + new Date().getTime();

  Logger.log('=== 품목 CRUD 테스트 시작 ===');

  // 1) 등록
  const 등록결과 = ITEM_save({
    품목명: 테스트품목명,
    분류: '테스트분류',
    단위: 'EA',
    사양: '2CC',
    사용여부: true
  });
  Logger.log('1. 등록: ' + 등록결과);

  // 2) 조회 + 품목ID 확보
  let 목록 = ITEM_getList();
  let 대상 = 목록.filter(function(x){ return x.품목명 === 테스트품목명; })[0];
  if (!대상) { throw new Error('등록된 테스트 품목을 찾지 못했습니다.'); }
  const 품목ID = 대상.품목ID;
  Logger.log('2. 조회: 품목ID=' + 품목ID + ', 총 ' + 목록.length + '건');

  // 3) 수정
  const 수정결과 = ITEM_save({
    품목ID: 품목ID,
    품목명: 테스트품목명,
    분류: '수정분류',
    단위: 'EA',
    사양: '10CC',
    사용여부: false
  });
  Logger.log('3. 수정: ' + 수정결과);

  // 4) 재조회
  목록 = ITEM_getList();
  대상 = 목록.filter(function(x){ return x.품목ID === 품목ID; })[0];
  Logger.log('4. 재조회: 분류=' + 대상.분류 + ', 사양=' + 대상.사양 + ', 사용여부=' + 대상.사용여부);

  // 5) 삭제
  const 삭제결과 = ITEM_delete(품목ID);
  Logger.log('5. 삭제: ' + 삭제결과);

  // 6) 삭제 확인
  목록 = ITEM_getList();
  const 남음 = 목록.filter(function(x){ return x.품목ID === 품목ID; }).length;
  Logger.log('6. 삭제 확인: 잔존 ' + 남음 + '건 (0이어야 정상)');

  Logger.log('=== 품목 CRUD 테스트 종료 ===');
}


// =====================================================================
// 03_품목 시트 재구성 (데이터 보존형 마이그레이션)
//
// 컬럼을 새 구조로 이관:
//   품목ID / 분류 / 품목명 / 단위 / 사양 / 사용여부 / 등록일시 / 수정일시
//
// - 기존 품목 데이터(행)는 보존한다.
// - 기존 헤더명을 기준으로 값을 새 컬럼 위치로 옮긴다.
// - 기본단가 / 관리단위 컬럼은 설계상 제거(값 폐기).
// - 이미 새 구조면 아무 작업도 하지 않는다.
// - 최초 1회 수동 실행.
// =====================================================================

function ITEM_시트재구성() {

  const 새헤더 = [
    '품목ID',
    '분류',
    '품목명',
    '단위',
    '사양',
    '사용여부',
    '등록일시',
    '수정일시'
  ];

  const ss =
    SpreadsheetApp.openById(DB_SPREADSHEET_ID);

  let sheet =
    ss.getSheetByName('03_품목');

  // 시트가 없으면 새로 만들고 헤더만 기록
  if (!sheet) {
    sheet = ss.insertSheet('03_품목');
    ITEM_헤더쓰기_(sheet, 새헤더);
    Logger.log('03_품목 신규 생성: 헤더만 기록');
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // 빈 시트면 헤더만 기록
  if (lastRow < 1 || lastCol < 1) {
    ITEM_헤더쓰기_(sheet, 새헤더);
    Logger.log('03_품목 빈 시트: 헤더만 기록');
    return;
  }

  const 기존헤더 =
    sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(v) { return String(v); });

  // 이미 새 구조면 종료 (중복 실행 방지)
  if (기존헤더.join('|') === 새헤더.join('|')) {
    Logger.log('03_품목 이미 새 구조. 변경 없음.');
    return;
  }

  // 기존 헤더명 → 인덱스
  const 위치 = {};
  새헤더.forEach(function(h) {
    위치[h] = 기존헤더.indexOf(h);
  });

  // 구 컬럼명 '규격' → 신 컬럼명 '사양' 이동 보정
  if (위치['사양'] < 0) {
    위치['사양'] = 기존헤더.indexOf('규격');
  }

  const 새행 = [];

  if (lastRow >= 2) {

    const 데이터 =
      sheet
        .getRange(2, 1, lastRow - 1, lastCol)
        .getValues();

    데이터.forEach(function(row) {

      const 가져오기 = function(field, 기본) {
        const c = 위치[field];
        return c >= 0 ? row[c] : (기본 === undefined ? '' : 기본);
      };

      const pid = String(가져오기('품목ID'));
      const pname = String(가져오기('품목명'));

      // 완전히 빈 행은 건너뜀
      if (pid === '' && pname === '') {
        return;
      }

      새행.push([
        가져오기('품목ID'),
        가져오기('분류'),
        가져오기('품목명'),
        가져오기('단위'),
        가져오기('사양'),
        가져오기('사용여부', true),
        가져오기('등록일시'),
        가져오기('수정일시')
      ]);

    });
  }

  // 새 구조로 재작성
  sheet.clear();

  ITEM_헤더쓰기_(sheet, 새헤더);

  if (새행.length > 0) {
    sheet
      .getRange(2, 1, 새행.length, 새헤더.length)
      .setValues(새행);
  }

  sheet.autoResizeColumns(1, 새헤더.length);

  SpreadsheetApp.flush();

  Logger.log(
    '03_품목 재구성 완료: ' + 새행.length +
    '건 이관 (기본단가/관리단위 제거)'
  );
}


function ITEM_헤더쓰기_(sheet, 헤더) {

  sheet
    .getRange(1, 1, 1, 헤더.length)
    .setValues([헤더]);

  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, 헤더.length)
    .setFontWeight('bold');

  sheet.autoResizeColumns(1, 헤더.length);
}