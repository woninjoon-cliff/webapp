// =====================================================================
// Auth.gs — 새 웹앱 인증
// =====================================================================


// =====================================================================
// 병원 목록
// =====================================================================

function AUTH_getHospitals() {
  const rows = DB_getAll('병원');

  return rows
    .filter(function(row) {
      return row['사용여부'] !== false &&
             String(row['사용여부']).toLowerCase() !== 'false';
    })
    .map(function(row) {
      return {
        병원ID: row['병원ID'],
        병원명: row['병원명']
      };
    });
}


// =====================================================================
// 로그인
// =====================================================================

function AUTH_login(hospitalId, username, password) {

  if (!hospitalId) {
    throw new Error('병원을 선택해주세요.');
  }

  if (!username) {
    throw new Error('아이디를 입력해주세요.');
  }

  if (!password) {
    throw new Error('비밀번호를 입력해주세요.');
  }

  const users = DB_findWhere('사용자', {
    병원ID: hospitalId,
    아이디: username
  });

  if (users.length === 0) {
    throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  const user = users[0];

  if (
    user['사용여부'] === false ||
    String(user['사용여부']).toLowerCase() === 'false'
  ) {
    throw new Error('사용할 수 없는 계정입니다.');
  }

  const passwordHash = AUTH_hashPassword(password);

  if (String(user['비밀번호해시']) !== passwordHash) {
    throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  // 마지막로그인 갱신 (실패해도 로그인은 진행)
  try {
    DB_updateById('사용자', '사용자ID', user['사용자ID'], {
      마지막로그인: new Date()
    });
  } catch (e) {
    // 무시
  }

  const token = AUTH_createSession(user);

  return {
    success: true,
    token: token,
    user: {
      사용자ID: user['사용자ID'],
      병원ID: user['병원ID'],
      아이디: user['아이디'],
      이름: user['이름'],
      권한: user['권한']
    }
  };
}


// =====================================================================
// 비밀번호 SHA-256
// =====================================================================

function AUTH_hashPassword(password) {

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );

  return digest
    .map(function(byte) {
      const v = byte < 0 ? byte + 256 : byte;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}


// =====================================================================
// 세션 저장소 (캐시 + Properties 이중화)
//
// ★ CacheService 단독이었다가 2026-08-21 이중화했다.
//   캐시가 put 을 받고도 get 이 즉시 null 을 반환하는 장애가 실제로 발생해
//   (편집기에서 test_BASE_전체흐름 직접 실행으로 재현·확인)
//   로그인 직후 모든 토큰 호출이 "세션 만료" 로 죽었다.
//   CacheService 는 원래 보존을 보장하지 않는 서비스다.
//
// 구조:
//   쓰기 = 캐시 + ScriptProperties 둘 다 (한쪽이 실패해도 로그인은 진행)
//   읽기 = 캐시 먼저 → 없으면 Properties 폴백 (캐시가 살아 있으면 지금과 동일)
//   만료 = createdAt 으로 자체 검사 (Properties 에는 TTL 이 없다)
//   정리 = 만료된 Properties 세션은 로그인 시점에 몰아서 삭제
// =====================================================================

var AUTH_세션유효초 = 21600;   // 6시간


function AUTH_세션키_(token) {
  return 'SESSION_' + token;
}


function AUTH_세션만료됨_(session) {

  const 경과초 =
    (new Date().getTime() - Number(session && session.createdAt || 0)) / 1000;

  // createdAt 이 없거나 이상하면 만료로 취급한다 (재로그인 유도)
  return !(경과초 >= 0 && 경과초 < AUTH_세션유효초);
}


// 만료된 세션 Properties 정리. 로그인은 드물어서 이 시점에 몰아 해도 부담 없다
function AUTH_만료세션정리_() {

  try {

    const props = PropertiesService.getScriptProperties();

    props.getKeys().forEach(function(key) {

      if (key.indexOf('SESSION_') !== 0) {
        return;
      }

      let session = null;

      try {
        session = JSON.parse(props.getProperty(key));
      } catch (e) {
        session = null;
      }

      if (!session || AUTH_세션만료됨_(session)) {
        props.deleteProperty(key);
      }
    });

  } catch (e) {
    // 정리는 부가 기능 — 실패해도 로그인은 진행한다
  }
}


// =====================================================================
// 세션 생성
// =====================================================================

function AUTH_createSession(user) {

  const token = Utilities.getUuid();

  const session = {
    사용자ID: user['사용자ID'],
    병원ID: user['병원ID'],
    아이디: user['아이디'],
    이름: user['이름'],
    권한: user['권한'],
    createdAt: new Date().getTime()
  };

  const key = AUTH_세션키_(token);
  const value = JSON.stringify(session);

  try {
    CacheService.getScriptCache().put(key, value, AUTH_세션유효초);
  } catch (e) {
    // 무시 — Properties 폴백이 있다
  }

  try {
    PropertiesService.getScriptProperties().setProperty(key, value);
  } catch (e) {
    // 무시 — 캐시가 살아 있으면 동작한다
  }

  AUTH_만료세션정리_();

  return token;
}


// =====================================================================
// 세션 확인
// =====================================================================

function AUTH_getSession(token) {

  if (!token) {
    return null;
  }

  const key = AUTH_세션키_(token);

  let value = null;
  let 캐시적중 = false;

  try {
    value = CacheService.getScriptCache().get(key);
    캐시적중 = !!value;
  } catch (e) {
    value = null;
  }

  if (!value) {
    try {
      value = PropertiesService.getScriptProperties().getProperty(key);
    } catch (e) {
      value = null;
    }
  }

  if (!value) {
    return null;
  }

  const session = JSON.parse(value);

  if (AUTH_세션만료됨_(session)) {
    AUTH_logout(token);
    return null;
  }

  // Properties 에서 읽었으면 캐시를 다시 데워 둔다 (캐시 복구 후에는 캐시로 응답)
  if (!캐시적중) {
    try {
      CacheService.getScriptCache().put(key, value, AUTH_세션유효초);
    } catch (e) {
      // 무시
    }
  }

  return session;
}


// =====================================================================
// 로그아웃
// =====================================================================

function AUTH_logout(token) {

  if (!token) {
    return true;
  }

  const key = AUTH_세션키_(token);

  try {
    CacheService.getScriptCache().remove(key);
  } catch (e) {
    // 무시
  }

  try {
    PropertiesService.getScriptProperties().deleteProperty(key);
  } catch (e) {
    // 무시
  }

  return true;
}


// =====================================================================
// 개발용 관리자 생성
//
// 현재 2개 병원용
// 최초 1회 실행
// =====================================================================

function AUTH_개발용관리자생성() {

  const hospitals = [
    {
      병원ID: 'H001',
      병원명: '비올라셀성형외과',
      병원코드: 'VIOLA'
    },
    {
      병원ID: 'H002',
      병원명: '제이셀성형외과',
      병원코드: 'JCELL'
    }
  ];

  const users = [
    {
      사용자ID: 'U000001',
      병원ID: 'H001',
      아이디: 'admin',
      이름: '관리자'
    },
    {
      사용자ID: 'U000002',
      병원ID: 'H002',
      아이디: 'admin',
      이름: '관리자'
    }
  ];

  // ---------------------------------------------------------------
  // 병원 생성
  // 이미 존재하면 생성하지 않음
  // ---------------------------------------------------------------

  hospitals.forEach(function(hospital) {

    const existing = DB_findWhere('병원', {
      병원ID: hospital.병원ID
    });

    if (existing.length === 0) {

      DB_insert('병원', {
        병원ID: hospital.병원ID,
        병원명: hospital.병원명,
        병원코드: hospital.병원코드,
        사용여부: true,
        등록일시: new Date(),
        수정일시: new Date()
      });

    }
  });


  // ---------------------------------------------------------------
  // 관리자 계정 생성
  // 이미 존재하면 생성하지 않음
  // ---------------------------------------------------------------

  users.forEach(function(userInfo) {

    const existing = DB_findWhere('사용자', {
      병원ID: userInfo.병원ID,
      아이디: userInfo.아이디
    });

    if (existing.length === 0) {

      DB_insert('사용자', {
        사용자ID: userInfo.사용자ID,
        병원ID: userInfo.병원ID,
        아이디: userInfo.아이디,
        비밀번호해시: AUTH_hashPassword('1234'),
        이름: userInfo.이름,
        권한: 'ADMIN',
        사용여부: true,
        마지막로그인: '',
        등록일시: new Date(),
        수정일시: new Date()
      });

    }
  });


  Logger.log('개발용 관리자 생성 완료');
  Logger.log('비올라셀성형외과 → admin / 1234');
  Logger.log('제이셀성형외과 → admin / 1234');
}