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
      '품목명',
      '분류',
      '규격',
      '단위',
      '기본단가',
      '관리단위',
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('03_품목');

  if (!sheet) {
    throw new Error('03_품목 시트를 찾을 수 없습니다.');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 10)
    .getValues();

  return values
    .filter(function(row) {
      return row[0] !== '' || row[1] !== '';
    })
    .map(function(row) {

      return {
        품목ID: row[0],
        품목명: row[1],
        분류: row[2],
        규격: row[3],
        단위: row[4],
        기본단가: row[5],
        관리단위: row[6],
        사용여부: row[7],
        등록일시: row[8],
        수정일시: row[9]
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  const 규격 =
    String(data.규격 || '').trim();

  const 단위 =
    String(data.단위 || '').trim();

  const 관리단위 =
    String(data.관리단위 || '').trim();

  let 기본단가 =
    Number(data.기본단가 || 0);

  if (
    isNaN(기본단가) ||
    기본단가 < 0
  ) {
    throw new Error(
      '기본단가는 0 이상의 숫자여야 합니다.'
    );
  }

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
          10
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
        String(rows[i][1] || '')
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


    sheet
      .getRange(
        targetRow,
        2,
        1,
        9
      )
      .setValues([[
        품목명,
        분류,
        규격,
        단위,
        기본단가,
        관리단위,
        사용여부,
        rows[targetRow - 2][8] || now,
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

    const names =
      sheet
        .getRange(
          2,
          2,
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


  sheet.appendRow([

    품목ID,
    품목명,
    분류,
    규격,
    단위,
    기본단가,
    관리단위,
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
    SpreadsheetApp.getActiveSpreadsheet();

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
    SpreadsheetApp.getActiveSpreadsheet();

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