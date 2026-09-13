/** 랜딩에서 작성한 설명만 문장별로 표시한다. 파일명·고객 입력에는 적용하지 않는다. */
export function SentenceText({ children }: { children: string }) {
  return <>{children.split(/(?<=[.!?])\s+/).map((sentence, index) =>
    <span className="ac-sentence" key={index}>{sentence}{/* 복사·보조기기에서도 문장 사이 공백을 유지한다. */}{" "}</span>
  )}</>;
}
