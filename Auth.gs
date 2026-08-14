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

  CacheService
    .getScriptCache()
    .put(
      'SESSION_' + token,
      JSON.stringify(session),
      21600
    );

  return token;
}


// =====================================================================
// 세션 확인
// =====================================================================

function AUTH_getSession(token) {

  if (!token) {
    return null;
  }

  const value = CacheService
    .getScriptCache()
    .get('SESSION_' + token);

  if (!value) {
    return null;
  }

  return JSON.parse(value);
}


// =====================================================================
// 로그아웃
// =====================================================================

function AUTH_logout(token) {

  if (!token) {
    return true;
  }

  CacheService
    .getScriptCache()
    .remove('SESSION_' + token);

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