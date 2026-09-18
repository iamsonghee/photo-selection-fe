import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "개인정보처리방침 | A-CUT",
  description: "A-CUT 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="개인정보처리방침" effectiveDate="2026년 9월 18일">
      <p>
        순한설기(이하 “운영자”)는 A-CUT 서비스 이용자의 개인정보를 중요하게 생각하며,
        「개인정보 보호법」 등 관련 법령을 준수합니다. 이 방침은 A-CUT이 어떤 정보를
        수집하고 어떻게 이용·보관·파기하는지 설명합니다.
      </p>

      <section>
        <h2>1. 개인정보의 처리 목적</h2>
        <ul className="space-y-1">
          <li>회원 식별, Google·카카오 로그인 및 계정 관리</li>
          <li>사진 프로젝트 생성, 고객 초대, 사진 선택, 보정 의견 수집 및 최종 납품</li>
          <li>프로필 제공, 베타 신청·운영, 문의 및 피드백 처리</li>
          <li>부정 이용 방지, 서비스 보안, 장애 대응 및 서비스 개선</li>
        </ul>
      </section>

      <section>
        <h2>2. 처리하는 개인정보 항목 및 보유기간</h2>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>구분</th><th>처리 항목</th><th>보유기간</th></tr></thead>
            <tbody>
              <tr><td>회원가입·로그인</td><td>소셜 계정 식별값, 이메일, 이름 또는 닉네임, 프로필 이미지, 로그인 제공자</td><td>회원 탈퇴 시까지</td></tr>
              <tr><td>작가 프로필</td><td>이름, 이메일, 연락처, 소개, 프로필 이미지, 인스타그램·포트폴리오 주소</td><td>회원 탈퇴 또는 이용자가 삭제할 때까지</td></tr>
              <tr><td>프로젝트 운영</td><td>프로젝트명, 고객명·연락처, 촬영일·장소·유형, 사진과 파일 정보, 고객 선택·별점·표시 이름·댓글·보정 요청, 프로젝트 링크와 PIN</td><td>프로젝트 또는 회원 계정 삭제 시까지. 납품 다운로드용 파일은 서비스에 표시된 보관 종료일까지</td></tr>
              <tr><td>베타 신청·설문·문의</td><td>이름, 휴대전화번호, 이메일, 신청·설문 답변, 문의 내용, 관련 페이지 및 프로젝트 정보</td><td>베타 운영 및 문의 처리 목적 달성 후 지체 없이 파기. 관계 법령에 따른 보존 의무가 있는 경우 해당 기간까지</td></tr>
              <tr><td>자동 생성 정보</td><td>IP 주소, 쿠키, 접속 일시, 브라우저·기기 정보, 서비스 이용 및 오류 기록</td><td>보안·장애 대응 및 관계 법령상 필요한 기간</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-[#666864]">서비스는 비밀번호를 직접 수집하지 않으며, 소셜 로그인 제공자가 인증을 처리합니다.</p>
      </section>

      <section>
        <h2>3. 사진 및 Google 사용자 데이터의 처리</h2>
        <p>
          이용자가 업로드하는 사진에는 촬영 대상자의 얼굴 등 개인정보가 포함될 수 있습니다.
          A-CUT은 해당 사진을 프로젝트 공유, 선택, 보정 검토, 다운로드 및 이용자가 요청한
          분석 기능을 제공하는 범위에서만 처리합니다.
        </p>
        <p>
          Google 로그인 시 이메일, 이름, 프로필 이미지 및 Google 계정 식별정보를 제공받을 수
          있습니다. 이 정보는 로그인, 회원 식별 및 계정 관리에만 사용하며 광고에 이용하거나
          판매하지 않습니다. A-CUT은 Google API로부터 받은 정보를
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer"> Google API Services User Data Policy</a>와
          Limited Use 요건에 따라 처리합니다.
        </p>
      </section>

      <section>
        <h2>4. 개인정보의 제3자 제공</h2>
        <p>
          운영자는 이용자의 동의가 있거나 법령에 근거한 경우를 제외하고 개인정보를 제3자에게
          제공하지 않습니다. 사진작가가 발급한 고객 링크를 통해 해당 프로젝트의 사진과 정보가
          링크를 전달받은 고객에게 공개될 수 있습니다.
        </p>
      </section>

      <section>
        <h2>5. 개인정보 처리의 위탁 및 국외 처리</h2>
        <p>서비스 제공을 위해 다음 업체의 글로벌 인프라를 이용합니다. 전송은 암호화된 네트워크를 통해 서비스 이용 시 이루어지며, 위탁 목적 달성 또는 이용자 데이터 삭제 시까지 처리됩니다.</p>
        <div className="mt-4 overflow-x-auto">
          <table>
            <thead><tr><th>업체</th><th>처리 목적</th><th>처리 정보</th><th>처리 국가</th></tr></thead>
            <tbody>
              <tr><td>Supabase, Inc.</td><td>인증, 데이터베이스 및 서비스 운영</td><td>계정, 프로필, 프로젝트 및 이용 기록</td><td>미국 및 서비스 제공 지역</td></tr>
              <tr><td>Cloudflare, Inc.</td><td>사진 파일 저장·전송 및 보안</td><td>업로드 사진, 파일 정보, IP 주소</td><td>미국 등 글로벌 데이터센터 소재국</td></tr>
              <tr><td>Google LLC</td><td>Google 로그인, 이용자가 실행한 사진 유사도·품질·매칭 분석</td><td>Google 계정 정보, 분석 대상 사진</td><td>미국 등 Google 인프라 소재국</td></tr>
              <tr><td>Vercel Inc.</td><td>웹서비스 호스팅 및 전송</td><td>접속·기기 정보, 서비스 요청 정보</td><td>미국 등 글로벌 데이터센터 소재국</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">국외 처리를 원하지 않는 이용자는 서비스 이용을 중단하고 회원 탈퇴를 요청할 수 있습니다. 이 경우 서비스 제공이 어려울 수 있습니다.</p>
      </section>

      <section>
        <h2>6. 개인정보의 파기</h2>
        <p>
          보유기간이 끝나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은
          복구하기 어려운 방법으로 삭제합니다. 프로젝트를 삭제하면 관련 사진, 댓글, 고객 정보가
          삭제되며 서비스 개선을 위한 비식별 통계만 남을 수 있습니다. 회원 탈퇴 시 계정 및 연결된
          프로젝트 데이터를 삭제하고 개인을 식별하지 않는 이용 통계만 보존할 수 있습니다.
        </p>
      </section>

      <section>
        <h2>7. 이용자의 권리와 행사 방법</h2>
        <p>
          이용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지 및 동의 철회를 요구할 수
          있습니다. 프로필과 프로젝트는 서비스 내에서 수정·삭제할 수 있으며, 회원 탈퇴 또는 그 밖의
          요청은 아래 연락처로 접수할 수 있습니다. 법령상 제한 사유가 없는 한 지체 없이 처리합니다.
        </p>
      </section>

      <section>
        <h2>8. 안전성 확보 조치</h2>
        <p>
          운영자는 접근 권한 제한, 전송 구간 암호화, 인증 정보 보호, 접근 기록 관리 및 서비스
          보안 점검 등 개인정보 보호에 필요한 조치를 시행합니다. 고객용 링크와 PIN은 프로젝트
          접근을 위한 정보이므로 이용자도 신뢰할 수 있는 상대에게만 전달해야 합니다.
        </p>
      </section>

      <section>
        <h2>9. 만 14세 미만 아동</h2>
        <p>A-CUT은 전문 사진작가를 위한 서비스로 만 14세 미만 아동의 회원가입을 의도적으로 받지 않습니다.</p>
      </section>

      <section>
        <h2>10. 개인정보 보호책임자 및 문의</h2>
        <p>개인정보 보호책임자: 심효순<br />이메일: <a href="mailto:multihatter@gmail.com">multihatter@gmail.com</a></p>
        <p>개인정보 침해에 대한 상담은 개인정보침해신고센터(국번 없이 118) 등 관계 기관에 문의할 수 있습니다.</p>
      </section>

      <section>
        <h2>11. 처리방침 변경</h2>
        <p>이 방침이 변경되는 경우 시행 전에 서비스 화면을 통해 알립니다. 중요한 변경은 합리적인 기간 전에 별도로 안내합니다.</p>
      </section>
    </LegalDocument>
  );
}
