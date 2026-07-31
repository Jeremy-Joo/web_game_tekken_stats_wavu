/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs 는 xlsx 생성 라우트(Node 런타임)에서만 쓴다.
  // 서버 번들에 그대로 두면 빌드가 느려지고 깨질 수 있어 외부 패키지로 뺀다.
  serverExternalPackages: ['exceljs'],
};

export default nextConfig;
