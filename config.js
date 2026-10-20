/* 배포 설정. 공개 키(publishable)만 둔다. 비밀 키(secret/service_role)는 절대 넣지 않는다. */
window.APP_CONFIG = {
  backendUrl: "", // Notion 중계 서버 주소. 비어 있으면 결과를 서버로 보내지 않는다.
  supabaseUrl: "https://ejtyfxqbulvqgbotgmap.supabase.co",
  supabaseKey: "sb_publishable_Zicw6cjV3BUo5UKio4R4zA_rR1kWbMv",
  privateChannels: false, // backend/supabase/001_study.sql 적용 후 true (로그인한 사용자만 방 채널 접근)
};
