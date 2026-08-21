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
  회원권: '15_회원권'
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

function DB_getHeaders(tableName) {
  const sheet = DB_getSheet(tableName);
  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    return [];
  }

  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0];
}


// =====================================================================
// 전체 데이터 조회
// =====================================================================

function DB_getAll(tableName) {
  const sheet = DB_getSheet(tableName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= 1 || lastColumn === 0) {
    return [];
  }

  const headers = DB_getHeaders(tableName);

  const values = sheet
    .getRange(2, 1, lastRow - 1, lastColumn)
    .getValues();

  return values.map(function(row) {
    const obj = {};

    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });

    return obj;
  });
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