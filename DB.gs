// =====================================================================
// DB.gs — VIVICELL 새 웹앱 DB 공통 모듈
// =====================================================================

const DB_SPREADSHEET_ID = '14QwrzCw1mZbegqUsFH2qgIUYl6I_6W7pE-Ubx2-qw9w';

const DB_SHEETS = {
  병원: '01_병원',
  사용자: '02_사용자',
  품목: '03_품목',
  거래처: '04_거래처',
  시술: '05_시술',
  시술사용품목: '06_시술사용품목',
  발주: '07_발주',
  발주품목: '08_발주품목',
  입고: '09_입고',
  입고품목: '10_입고품목',
  LOT: '11_LOT',
  재고이력: '12_재고이력',
  시스템로그: '13_시스템로그',
  기준정보: '14_기준정보',
  멤버십: '15_멤버십'
};


// =====================================================================
// Spreadsheet
// =====================================================================

function DB_getSpreadsheet() {
  return SpreadsheetApp.openById(DB_SPREADSHEET_ID);
}


// =====================================================================
// Sheet
// =====================================================================

function DB_getSheet(tableName) {
  const sheetName = DB_SHEETS[tableName];

  if (!sheetName) {
    throw new Error('존재하지 않는 DB 테이블: ' + tableName);
  }

  const sheet = DB_getSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('DB 시트를 찾을 수 없습니다: ' + sheetName);
  }

  return sheet;
}


// =====================================================================
// Headers
// =====================================================================

// =====================================================================
// 요청 단위 캐시 (2026-08-21)
//
// 배경: DB_getAll 은 호출할 때마다 시트를 통째로 다시 읽었다.
//   시술 저장 1회에 05_시술 3회 + 14_기준정보 9회 + 15_멤버십 1회 = 13회 읽기.
//   PROC_새ID목록_ 은 최대 ID 하나 찾자고 05_시술 전체를 읽는다.
//   시술 100건/일이면 1년에 3만 행이 되므로 이대로면 저장이 수 초씩 걸린다.
//
// 동작: google.script.run 호출마다 스크립트가 새로 실행되므로,
//   전역 객체에 담아두면 캐시 수명이 자연스럽게 "요청 1회" 가 된다.
//   요청이 끝나면 사라지므로 다른 사용자의 변경을 못 보는 일은 없다.
//
// ★ 쓰기 후에는 반드시 무효화해야 한다.
//   DB_insert / DB_insertMany / DB_updateById 는 자동으로 비운다.
//   **DB 레이어를 거치지 않고 시트에 직접 쓰는 함수**(setValue·appendRow·
//   deleteRow·clear 등)는 쓴 뒤 DB_캐시비우기(테이블명) 를 직접 호출해야 한다.
//   현재 해당 함수: ITEM_save / ITEM_delete / ITEM_시트재구성 /
//   USER_save / USER_사용여부변경 / HOSPITAL_save /
//   BASE_시트생성및시딩 / PROC_시트재구성
//   → 새로 직접 쓰기를 추가하면 무효화도 함께 넣을 것
// =====================================================================

var DB_캐시_행 = {};
var DB_캐시_헤더 = {};


function DB_캐시비우기(tableName) {

  if (tableName === undefined || tableName === null) {
    DB_캐시_행 = {};
    DB_캐시_헤더 = {};
    return;
  }

  delete DB_캐시_행[tableName];
  delete DB_캐시_헤더[tableName];
}


function DB_getHeaders(tableName) {

  if (DB_캐시_헤더[tableName]) {
    return DB_캐시_헤더[tableName];
  }

  const sheet = DB_getSheet(tableName);
  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    return [];
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0];

  DB_캐시_헤더[tableName] = headers;

  return headers;
}


// =====================================================================
// 전체 데이터 조회
// =====================================================================

function DB_getAll(tableName) {

  if (DB_캐시_행[tableName]) {
    return DB_캐시_행[tableName];
  }

  const sheet = DB_getSheet(tableName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= 1 || lastColumn === 0) {
    // 빈 시트도 캐시한다 (같은 요청에서 반복 호출되는 경우가 있다)
    DB_캐시_행[tableName] = [];
    return DB_캐시_행[tableName];
  }

  const headers = DB_getHeaders(tableName);

  const values = sheet
    .getRange(2, 1, lastRow - 1, lastColumn)
    .getValues();

  const rows = values.map(function(row) {
    const obj = {};

    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });

    return obj;
  });

  DB_캐시_행[tableName] = rows;

  return rows;
}


// =====================================================================
// ID로 1건 조회
// =====================================================================

function DB_findById(tableName, idField, idValue) {
  const rows = DB_getAll(tableName);

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][idField]) === String(idValue)) {
      return rows[i];
    }
  }

  return null;
}


// =====================================================================
// 조건으로 조회
//
// conditions 예:
// {
//   병원ID: 'H001',
//   사용여부: true
// }
// =====================================================================

function DB_findWhere(tableName, conditions) {
  const rows = DB_getAll(tableName);

  return rows.filter(function(row) {
    return Object.keys(conditions).every(function(field) {
      return String(row[field]) === String(conditions[field]);
    });
  });
}


// =====================================================================
// 1건 추가
//
// data 예:
// {
//   병원ID: 'H001',
//   병원명: '비비셀병원',
//   사용여부: true
// }
// =====================================================================

function DB_insert(tableName, data) {
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    const sheet = DB_getSheet(tableName);
    const headers = DB_getHeaders(tableName);

    const row = headers.map(function(header) {
      return data[header] !== undefined
        ? data[header]
        : '';
    });

    sheet
      .getRange(sheet.getLastRow() + 1, 1, 1, headers.length)
      .setValues([row]);

    DB_캐시비우기(tableName);

    return data;

  } finally {
    lock.releaseLock();
  }
}


// =====================================================================
// 여러 건 추가
// =====================================================================

function DB_insertMany(tableName, dataList) {
  if (!Array.isArray(dataList) || dataList.length === 0) {
    return [];
  }

  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    const sheet = DB_getSheet(tableName);
    const headers = DB_getHeaders(tableName);

    const rows = dataList.map(function(data) {
      return headers.map(function(header) {
        return data[header] !== undefined
          ? data[header]
          : '';
      });
    });

    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        rows.length,
        headers.length
      )
      .setValues(rows);

    DB_캐시비우기(tableName);

    return dataList;

  } finally {
    lock.releaseLock();
  }
}


// =====================================================================
// ID 기준 수정
//
// updates 예:
// {
//   환자명: '홍길동',
//   상태: '완료'
// }
// =====================================================================

function DB_updateById(tableName, idField, idValue, updates) {
  const sheet = DB_getSheet(tableName);
  const headers = DB_getHeaders(tableName);

  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    throw new Error('수정할 데이터가 없습니다.');
  }

  const idColumn = headers.indexOf(idField);

  if (idColumn === -1) {
    throw new Error(
      tableName + ' 테이블에 ' + idField + ' 컬럼이 없습니다.'
    );
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, headers.length)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idColumn]) === String(idValue)) {

      Object.keys(updates).forEach(function(field) {
        const column = headers.indexOf(field);

        if (column !== -1) {
          values[i][column] = updates[field];
        }
      });

      sheet
        .getRange(i + 2, 1, 1, headers.length)
        .setValues([values[i]]);

      DB_캐시비우기(tableName);

      return true;
    }
  }

  throw new Error(
    tableName + '에서 ' + idField + '=' + idValue + ' 데이터를 찾을 수 없습니다.'
  );
}


// =====================================================================
// 테스트
// =====================================================================

function DB_테스트() {
  const result = {
    병원: DB_getHeaders('병원'),
    사용자: DB_getHeaders('사용자'),
    품목: DB_getHeaders('품목'),
    거래처: DB_getHeaders('거래처'),
    시술: DB_getHeaders('시술'),
    시술사용품목: DB_getHeaders('시술사용품목'),
    발주: DB_getHeaders('발주'),
    발주품목: DB_getHeaders('발주품목'),
    입고: DB_getHeaders('입고'),
    입고품목: DB_getHeaders('입고품목'),
    LOT: DB_getHeaders('LOT'),
    재고이력: DB_getHeaders('재고이력'),
    시스템로그: DB_getHeaders('시스템로그')
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}