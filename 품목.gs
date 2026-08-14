// =====================================================================
// 품목.gs
// 품목 등록 / 수정 / 조회
// =====================================================================


// =====================================================================
// 품목 목록 조회
// =====================================================================

function 웹앱_품목목록_가져오기() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('03_품목');

  if (!sheet) {
    throw new Error('03_품목 시트를 찾을 수 없습니다.');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const lastColumn = 10;

  const values = sheet
    .getRange(1, 1, lastRow, lastColumn)
    .getValues();

  const headers = values[0];

  return values
    .slice(1)
    .filter(function(row) {

      return row[0] !== '' ||
             row[1] !== '' ||
             row[2] !== '';

    })
    .map(function(row) {

      const item = {};

      headers.forEach(function(header, index) {
        item[header] = row[index];
      });

      return item;

    });
}


// =====================================================================
// 품목 등록
// =====================================================================

function 웹앱_품목등록(data) {

  data = data || {};

  const 품목명 = String(data.품목명 || '').trim();
  const 분류 = String(data.분류 || '').trim();
  const 규격 = String(data.규격 || '').trim();
  const 단위 = String(data.단위 || '').trim();
  const 기본단가 = data.기본단가 === '' || data.기본단가 == null
    ? 0
    : Number(data.기본단가);
  const 관리단위 = String(data.관리단위 || '').trim();

  if (!품목명) {
    throw new Error('품목명을 입력해주세요.');
  }

  if (isNaN(기본단가) || 기본단가 < 0) {
    throw new Error('기본단가는 0 이상의 숫자로 입력해주세요.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('03_품목');

  if (!sheet) {
    throw new Error('03_품목 시트를 찾을 수 없습니다.');
  }

  // 중복 품목명 확인
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {

    const names = sheet
      .getRange(2, 2, lastRow - 1, 1)
      .getValues();

    for (let i = 0; i < names.length; i++) {

      const existingName =
        String(names[i][0] || '').trim();

      if (
        existingName &&
        existingName === 품목명
      ) {
        throw new Error(
          '이미 등록된 품목명입니다: ' + 품목명
        );
      }
    }
  }

  const now = new Date();

  const 품목ID = 품목ID생성_();

  const row = [
    품목ID,
    품목명,
    분류,
    규격,
    단위,
    기본단가,
    관리단위,
    true,
    now,
    now
  ];

  sheet
    .getRange(sheet.getLastRow() + 1, 1, 1, row.length)
    .setValues([row]);

  SpreadsheetApp.flush();

  return {
    success: true,
    message: '품목이 등록되었습니다.',
    품목ID: 품목ID
  };
}


// =====================================================================
// 품목 수정
// =====================================================================

function 웹앱_품목수정(data) {

  data = data || {};

  const 품목ID =
    String(data.품목ID || '').trim();

  const 품목명 =
    String(data.품목명 || '').trim();

  const 분류 =
    String(data.분류 || '').trim();

  const 규격 =
    String(data.규격 || '').trim();

  const 단위 =
    String(data.단위 || '').trim();

  const 기본단가 =
    data.기본단가 === '' || data.기본단가 == null
      ? 0
      : Number(data.기본단가);

  const 관리단위 =
    String(data.관리단위 || '').trim();

  const 사용여부 =
    data.사용여부 !== false &&
    String(data.사용여부).toLowerCase() !== 'false';

  if (!품목ID) {
    throw new Error('품목ID가 없습니다.');
  }

  if (!품목명) {
    throw new Error('품목명을 입력해주세요.');
  }

  if (isNaN(기본단가) || 기본단가 < 0) {
    throw new Error('기본단가는 0 이상의 숫자로 입력해주세요.');
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
      '수정할 품목이 없습니다.'
    );
  }

  const values =
    sheet
      .getRange(2, 1, lastRow - 1, 10)
      .getValues();

  let targetRow = -1;

  for (let i = 0; i < values.length; i++) {

    if (
      String(values[i][0] || '').trim() ===
      품목ID
    ) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error(
      '해당 품목을 찾을 수 없습니다.'
    );
  }

  // 다른 품목과 품목명 중복 확인
  for (let i = 0; i < values.length; i++) {

    const rowNumber = i + 2;

    if (rowNumber === targetRow) {
      continue;
    }

    const existingName =
      String(values[i][1] || '').trim();

    if (
      existingName &&
      existingName === 품목명
    ) {
      throw new Error(
        '이미 사용 중인 품목명입니다: ' +
        품목명
      );
    }
  }

  sheet
    .getRange(targetRow, 2, 1, 9)
    .setValues([[
      품목명,
      분류,
      규격,
      단위,
      기본단가,
      관리단위,
      사용여부,
      values[targetRow - 2][8],
      new Date()
    ]]);

  SpreadsheetApp.flush();

  return {
    success: true,
    message: '품목이 수정되었습니다.'
  };
}


// =====================================================================
// 품목 ID 생성
// =====================================================================

function 품목ID생성_() {

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

  let maxNumber = 0;

  if (lastRow >= 2) {

    const ids =
      sheet
        .getRange(2, 1, lastRow - 1, 1)
        .getValues();

    ids.forEach(function(row) {

      const id =
        String(row[0] || '').trim();

      const match =
        id.match(/^ITEM(\d+)$/i);

      if (match) {

        const number =
          Number(match[1]);

        if (number > maxNumber) {
          maxNumber = number;
        }
      }
    });
  }

  return 'ITEM' +
    String(maxNumber + 1)
      .padStart(6, '0');
}