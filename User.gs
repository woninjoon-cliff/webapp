// =====================================================================
// User.gs — 관리 > 사용자 관리 서버 함수
//
// 대상 시트: 02_사용자 (10열)
//   0 사용자ID / 1 병원ID / 2 아이디 / 3 비밀번호해시 / 4 이름 /
//   5 권한 / 6 사용여부 / 7 마지막로그인 / 8 등록일시 / 9 수정일시
//
// 원칙
// - 모든 함수는 첫 인자로 세션 토큰을 받는다.
// - 세션 병원ID로 필터/검증한다. 다른 병원 데이터는 조회·수정 불가.
// - 물리 삭제 없음. 사용여부 토글(논리 삭제)만 제공한다.
// - 권한은 ADMIN(관리자) / STAFF(직원) 2종만 허용한다.
// - 비밀번호해시는 절대 클라이언트로 반환하지 않는다.
// =====================================================================


// 권한 허용값
const USER_권한목록_ = ['ADMIN', 'STAFF'];

// 시트명
const USER_시트명_ = '02_사용자';


// =====================================================================
// 세션 확인
// =====================================================================

function USER_세션_(token) {

  const session = AUTH_getSession(token);

  if (!session || !session['병원ID']) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  return session;
}


// =====================================================================
// 사용여부 불린 변환
// =====================================================================

function USER_불린_(값) {

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

function USER_시트_() {

  const sheet = SpreadsheetApp
    .openById(DB_SPREADSHEET_ID)
    .getSheetByName(USER_시트명_);

  if (!sheet) {
    throw new Error(USER_시트명_ + ' 시트를 찾을 수 없습니다.');
  }

  return sheet;
}


// =====================================================================
// 전체 행 읽기 (헤더 제외)
// =====================================================================

function USER_전체행_(sheet) {

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, 10)
    .getValues();
}


// =====================================================================
// 날짜 표시용 변환 (클라이언트 전송 시 Date 객체 방지)
// =====================================================================

function USER_일시문자열_(값) {

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
// 사용자 목록 조회
//
// 세션 병원의 사용자만 반환. 비밀번호해시는 제외한다.
// =====================================================================

function USER_getList(token) {

  const session = USER_세션_(token);
  const 병원ID = String(session['병원ID']);

  const rows = USER_전체행_(USER_시트_());

  const result = [];

  rows.forEach(function(row) {

    const 사용자ID = String(row[0] || '').trim();

    if (!사용자ID) {
      return;
    }

    if (String(row[1] || '').trim() !== 병원ID) {
      return;
    }

    result.push({
      사용자ID: 사용자ID,
      병원ID: String(row[1] || ''),
      아이디: String(row[2] || ''),
      이름: String(row[4] || ''),
      권한: String(row[5] || ''),
      사용여부: USER_불린_(row[6]),
      마지막로그인: USER_일시문자열_(row[7]),
      등록일시: USER_일시문자열_(row[8]),
      수정일시: USER_일시문자열_(row[9]),
      본인여부: 사용자ID === String(session['사용자ID'] || '')
    });

  });

  return result;
}


// =====================================================================
// 사용자 ID 생성 (전 병원 통합 채번, U000001~)
// =====================================================================

function USER_새ID생성_() {

  const rows = USER_전체행_(USER_시트_());

  let maxNumber = 0;

  rows.forEach(function(row) {

    const match = String(row[0] || '').trim().match(/^U(\d+)$/i);

    if (match) {

      const number = Number(match[1]);

      if (number > maxNumber) {
        maxNumber = number;
      }
    }
  });

  return 'U' + String(maxNumber + 1).padStart(6, '0');
}


// =====================================================================
// 해당 병원의 활성 ADMIN 사용자ID 목록
// =====================================================================

function USER_활성관리자목록_(rows, 병원ID) {

  const list = [];

  rows.forEach(function(row) {

    if (String(row[1] || '').trim() !== 병원ID) {
      return;
    }

    if (String(row[5] || '').trim().toUpperCase() !== 'ADMIN') {
      return;
    }

    if (!USER_불린_(row[6])) {
      return;
    }

    list.push(String(row[0] || '').trim());
  });

  return list;
}


// =====================================================================
// 사용자 저장 (등록 / 수정)
//
// data = {
//   사용자ID: '',        // 있으면 수정, 없으면 신규
//   아이디: '',
//   이름: '',
//   권한: 'ADMIN' | 'STAFF',
//   사용여부: true,
//   비밀번호: ''         // 신규는 필수, 수정은 공란이면 기존 유지
// }
// =====================================================================

function USER_save(token, data) {

  const session = USER_세션_(token);
  const 병원ID = String(session['병원ID']);
  const 세션사용자ID = String(session['사용자ID'] || '');

  const 사용자ID = String((data && data.사용자ID) || '').trim();
  const 아이디 = String((data && data.아이디) || '').trim();
  const 이름 = String((data && data.이름) || '').trim();
  const 권한 = String((data && data.권한) || '').trim().toUpperCase();
  const 사용여부 = USER_불린_(data ? data.사용여부 : true);
  const 비밀번호 = String((data && data.비밀번호) || '');

  // ---------------------------------------------------------------
  // 입력 검증
  // ---------------------------------------------------------------

  if (!아이디) {
    throw new Error('아이디를 입력해주세요.');
  }

  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(아이디)) {
    throw new Error(
      '아이디는 영문, 숫자, _ . - 조합 3~20자로 입력해주세요.'
    );
  }

  if (!이름) {
    throw new Error('이름을 입력해주세요.');
  }

  if (USER_권한목록_.indexOf(권한) === -1) {
    throw new Error('권한은 ADMIN 또는 STAFF만 선택할 수 있습니다.');
  }

  if (비밀번호 && 비밀번호.length < 4) {
    throw new Error('비밀번호는 4자 이상으로 입력해주세요.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {

    const sheet = USER_시트_();
    const rows = USER_전체행_(sheet);
    const now = new Date();

    // -------------------------------------------------------------
    // 아이디 중복 검사 (같은 병원 내에서만)
    // -------------------------------------------------------------

    for (let i = 0; i < rows.length; i++) {

      if (String(rows[i][1] || '').trim() !== 병원ID) {
        continue;
      }

      if (String(rows[i][0] || '').trim() === 사용자ID) {
        continue;
      }

      if (
        String(rows[i][2] || '').trim().toLowerCase() ===
        아이디.toLowerCase()
      ) {
        throw new Error('이미 사용 중인 아이디입니다: ' + 아이디);
      }
    }

    // -------------------------------------------------------------
    // 수정
    // -------------------------------------------------------------

    if (사용자ID) {

      let targetIndex = -1;

      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === 사용자ID) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) {
        throw new Error('수정할 사용자를 찾을 수 없습니다.');
      }

      const target = rows[targetIndex];

      if (String(target[1] || '').trim() !== 병원ID) {
        throw new Error('다른 병원의 사용자는 수정할 수 없습니다.');
      }

      // 본인 계정 비활성화 차단
      if (사용자ID === 세션사용자ID && !사용여부) {
        throw new Error('본인 계정은 사용중지할 수 없습니다.');
      }

      // 본인 계정 권한 강등 차단
      if (
        사용자ID === 세션사용자ID &&
        String(target[5] || '').trim().toUpperCase() === 'ADMIN' &&
        권한 !== 'ADMIN'
      ) {
        throw new Error('본인 계정의 관리자 권한은 해제할 수 없습니다.');
      }

      // 마지막 관리자 보호
      const 활성관리자 = USER_활성관리자목록_(rows, 병원ID);

      const 관리자유지 = (권한 === 'ADMIN' && 사용여부);

      if (
        !관리자유지 &&
        활성관리자.length === 1 &&
        활성관리자[0] === 사용자ID
      ) {
        throw new Error(
          '병원에 활성 관리자가 최소 1명은 있어야 합니다.'
        );
      }

      const 비밀번호해시 = 비밀번호
        ? AUTH_hashPassword(비밀번호)
        : target[3];

      sheet
        .getRange(targetIndex + 2, 1, 1, 10)
        .setValues([[
          사용자ID,
          병원ID,
          아이디,
          비밀번호해시,
          이름,
          권한,
          사용여부,
          target[7],
          target[8],
          now
        ]]);

      SpreadsheetApp.flush();

      DB_캐시비우기('사용자');

      return '사용자 정보가 수정되었습니다.';
    }

    // -------------------------------------------------------------
    // 신규 등록
    // -------------------------------------------------------------

    if (!비밀번호) {
      throw new Error('신규 등록 시 비밀번호는 필수입니다.');
    }

    const 새ID = USER_새ID생성_();

    sheet.appendRow([
      새ID,
      병원ID,
      아이디,
      AUTH_hashPassword(비밀번호),
      이름,
      권한,
      사용여부,
      '',
      now,
      now
    ]);

    SpreadsheetApp.flush();

    DB_캐시비우기('사용자');

    return '사용자 등록이 완료되었습니다.';

  } finally {
    lock.releaseLock();
  }
}


// =====================================================================
// 사용여부 변경 (논리 삭제 / 복구)
// =====================================================================

function USER_사용여부변경(token, 사용자ID, 사용여부) {

  const session = USER_세션_(token);
  const 병원ID = String(session['병원ID']);
  const 세션사용자ID = String(session['사용자ID'] || '');

  const id = String(사용자ID || '').trim();
  const 값 = USER_불린_(사용여부);

  if (!id) {
    throw new Error('대상 사용자ID가 없습니다.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {

    const sheet = USER_시트_();
    const rows = USER_전체행_(sheet);

    let targetIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === id) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      throw new Error('대상 사용자를 찾을 수 없습니다.');
    }

    const target = rows[targetIndex];

    if (String(target[1] || '').trim() !== 병원ID) {
      throw new Error('다른 병원의 사용자는 변경할 수 없습니다.');
    }

    if (id === 세션사용자ID && !값) {
      throw new Error('본인 계정은 사용중지할 수 없습니다.');
    }

    if (!값) {

      const 활성관리자 = USER_활성관리자목록_(rows, 병원ID);

      if (활성관리자.length === 1 && 활성관리자[0] === id) {
        throw new Error(
          '병원에 활성 관리자가 최소 1명은 있어야 합니다.'
        );
      }
    }

    // 사용여부(7열) / 수정일시(10열)만 갱신
    sheet.getRange(targetIndex + 2, 7).setValue(값);
    sheet.getRange(targetIndex + 2, 10).setValue(new Date());

    SpreadsheetApp.flush();

    DB_캐시비우기('사용자');

    return 값
      ? '사용으로 변경되었습니다.'
      : '사용중지로 변경되었습니다.';

  } finally {
    lock.releaseLock();
  }
}


// =====================================================================
// 통합 테스트 (등록 → 조회 → 수정 → 재조회 → 사용중지 → 복구)
//
// 편집기에서 직접 실행. 로그로 결과 확인.
// 테스트 계정은 마지막에 사용중지 상태로 남는다(물리 삭제 없음).
// =====================================================================

function test_USER_전체흐름() {

  const 테스트병원ID = 'H003';

  Logger.log('=== 사용자 CRUD 테스트 시작 ===');

  // 임시 세션 생성
  const token = AUTH_createSession({
    사용자ID: '__TEST_ADMIN__',
    병원ID: 테스트병원ID,
    아이디: '__test__',
    이름: '테스트관리자',
    권한: 'ADMIN'
  });

  const 테스트아이디 = 'tst' + new Date().getTime().toString().slice(-8);

  // 1) 등록
  Logger.log('1. 등록: ' + USER_save(token, {
    아이디: 테스트아이디,
    이름: '테스트직원',
    권한: 'STAFF',
    사용여부: true,
    비밀번호: '1234'
  }));

  // 2) 조회
  let 목록 = USER_getList(token);
  let 대상 = 목록.filter(function(x) {
    return x.아이디 === 테스트아이디;
  })[0];

  if (!대상) {
    throw new Error('등록된 테스트 사용자를 찾지 못했습니다.');
  }

  const 사용자ID = 대상.사용자ID;

  Logger.log(
    '2. 조회: 사용자ID=' + 사용자ID +
    ', 병원 총 ' + 목록.length + '명'
  );

  // 3) 수정 (이름/권한 변경, 비밀번호 공란 = 기존 유지)
  Logger.log('3. 수정: ' + USER_save(token, {
    사용자ID: 사용자ID,
    아이디: 테스트아이디,
    이름: '테스트직원_수정',
    권한: 'ADMIN',
    사용여부: true,
    비밀번호: ''
  }));

  // 4) 재조회
  목록 = USER_getList(token);
  대상 = 목록.filter(function(x) {
    return x.사용자ID === 사용자ID;
  })[0];

  Logger.log(
    '4. 재조회: 이름=' + 대상.이름 +
    ', 권한=' + 대상.권한 +
    ', 사용여부=' + 대상.사용여부
  );

  // 5) 사용중지 (논리 삭제)
  Logger.log(
    '5. 사용중지: ' +
    USER_사용여부변경(token, 사용자ID, false)
  );

  목록 = USER_getList(token);
  대상 = 목록.filter(function(x) {
    return x.사용자ID === 사용자ID;
  })[0];

  Logger.log('6. 확인: 사용여부=' + 대상.사용여부 + ' (false여야 정상)');

  // 7) 복구
  Logger.log(
    '7. 복구: ' +
    USER_사용여부변경(token, 사용자ID, true)
  );

  // 8) 아이디 중복 차단 확인
  try {
    USER_save(token, {
      아이디: 테스트아이디,
      이름: '중복테스트',
      권한: 'STAFF',
      사용여부: true,
      비밀번호: '1234'
    });
    Logger.log('8. 중복 검사: 실패 (차단되지 않음)');
  } catch (e) {
    Logger.log('8. 중복 검사: 정상 차단 - ' + e.message);
  }

  // 9) 잘못된 권한 차단 확인
  try {
    USER_save(token, {
      아이디: 테스트아이디 + 'x',
      이름: '권한테스트',
      권한: 'MANAGER',
      사용여부: true,
      비밀번호: '1234'
    });
    Logger.log('9. 권한 검사: 실패 (차단되지 않음)');
  } catch (e) {
    Logger.log('9. 권한 검사: 정상 차단 - ' + e.message);
  }

  AUTH_logout(token);

  Logger.log('=== 사용자 CRUD 테스트 종료 ===');
  Logger.log(
    '테스트 계정 ' + 테스트아이디 +
    ' 이 남아 있습니다. 필요 시 시트에서 직접 정리하세요.'
  );
}