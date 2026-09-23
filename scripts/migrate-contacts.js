#!/usr/bin/env node
/**
 * users/{uid} 공개 문서에 남아 있는 연락처(email, studentEmail)를
 * users/{uid}/private/contact (본인만 읽을 수 있는 문서)로 옮기고 공개 문서에서 지운다.
 *
 * 왜 필요한가
 *   users/{uid} 문서는 "로그인한 사람이면 누구나" 읽을 수 있다(탐색 탭 카드가 이 문서를 그대로
 *   읽어 그리기 때문). Firestore에는 필드 단위 읽기 규칙이 없어서, 이 문서에 이메일이 들어 있으면
 *   계정 하나만 만들면 전체 회원의 이메일을 긁어갈 수 있었다.
 *   앱(20260801.html)은 이제 로그인할 때마다 자기 문서를 스스로 옮기지만(migrateContactToPrivate),
 *   한동안 로그인하지 않는 휴면 계정은 그대로 남는다. 이 스크립트는 그 나머지를 한 번에 정리한다.
 *
 * 준비물
 *   1) Node 18+
 *   2) npm i -D firebase-admin        (이 저장소에 상시 의존성으로 두지 않아도 된다)
 *   3) 서비스 계정 키 — 둘 중 하나:
 *        - Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"으로 받은 JSON 파일
 *        - 이미 GitHub Actions에 쓰고 있는 FIREBASE_SERVICE_ACCOUNT_UNILY_E973F 값을 파일로 저장한 것
 *      ※ 이 키는 데이터베이스 전체 권한이다. 저장소에 절대 커밋하지 말고, 작업이 끝나면 지우거나
 *        콘솔에서 해당 키를 폐기(revoke)할 것.
 *
 * 사용법 (먼저 반드시 미리보기부터)
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json   (PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="...")
 *   node scripts/migrate-contacts.js                # 미리보기(dry run) — 아무것도 바꾸지 않는다
 *   node scripts/migrate-contacts.js --apply        # 실제로 이전 + 공개 필드 삭제
 *   node scripts/migrate-contacts.js --apply --keep-public   # 이전만 하고 공개 필드는 남겨둠(비상용)
 *
 * 안전장치
 *   - 기본이 dry run이다. --apply를 붙여야 쓰기가 일어난다.
 *   - 비공개 문서에는 merge로 쓰므로 이미 옮겨진 값이 있으면 덮어쓰지 않고 합쳐진다.
 *   - 공개 필드 삭제는 비공개 쓰기가 성공한 뒤에만, 같은 배치 안에서 수행한다.
 *   - 중간에 끊겨도 다시 돌리면 남은 것만 처리한다(멱등).
 */

const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");
const KEEP_PUBLIC = process.argv.includes("--keep-public");
const CONTACT_FIELDS = ["email", "studentEmail"];
const BATCH_LIMIT = 200; // Firestore 배치 상한은 500 op — 문서당 최대 2 op라 넉넉하게 잡는다

function fail(message) {
  console.error("\n✖ " + message + "\n");
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
  fail(
    "서비스 계정 키를 찾을 수 없습니다.\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS 환경변수에 키 JSON 파일 경로를 넣고 다시 실행하세요.\n" +
      "  (파일 위치 예: C:\\\\Users\\\\...\\\\unily-service-account.json)"
  );
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID || "unily-e973f",
});

const db = admin.firestore();

async function main() {
  console.log(APPLY ? "== 실제 이전 모드 (--apply) ==" : "== 미리보기 모드 (dry run) — 아무것도 바꾸지 않습니다 ==");

  const snap = await db.collection("users").get();
  console.log(`users 문서 ${snap.size}건 검사 중...`);

  let pending = [];
  let moved = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const contact = {};
    for (const field of CONTACT_FIELDS) {
      if (typeof data[field] === "string" && data[field].trim()) contact[field] = data[field].trim();
    }
    if (Object.keys(contact).length === 0) {
      skipped += 1;
      continue;
    }
    moved += 1;
    // 이메일 본문은 로그에 남기지 않는다(로그 파일이 또 하나의 유출 경로가 되지 않도록).
    console.log(`  ${doc.id}: ${Object.keys(contact).join(", ")} 이전 대상`);
    pending.push({ ref: doc.ref, contact });

    if (pending.length >= BATCH_LIMIT) {
      await flush(pending);
      pending = [];
    }
  }
  if (pending.length) await flush(pending);

  console.log("");
  console.log(`이전 대상 ${moved}건 / 이미 깨끗한 문서 ${skipped}건`);
  if (!APPLY) {
    console.log("실제로 적용하려면 --apply 를 붙여 다시 실행하세요.");
  } else {
    console.log("완료. Firebase 콘솔에서 users 문서에 email/studentEmail이 남아 있지 않은지 확인하세요.");
    console.log("확인이 끝나면 이 작업에 쓴 서비스 계정 키를 폐기(revoke)하는 걸 권장합니다.");
  }
}

async function flush(items) {
  if (!APPLY) return;
  const batch = db.batch();
  for (const { ref, contact } of items) {
    batch.set(ref.collection("private").doc("contact"), contact, { merge: true });
    if (!KEEP_PUBLIC) {
      const cleared = {};
      for (const field of Object.keys(contact)) cleared[field] = admin.firestore.FieldValue.delete();
      batch.update(ref, cleared);
    }
  }
  await batch.commit();
  console.log(`  → ${items.length}건 커밋`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
