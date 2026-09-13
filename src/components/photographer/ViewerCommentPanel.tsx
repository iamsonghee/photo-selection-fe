import { MessageSquareQuote } from "lucide-react";
import styles from "./ViewerCommentPanel.module.css";

export type ViewerComment = {
  label?: string;
  text: string;
};

type ViewerCommentPanelProps = {
  comments: ViewerComment[];
  heading?: string;
};

export function ViewerCommentPanel({
  comments,
  heading = "고객 코멘트",
}: ViewerCommentPanelProps) {
  const visibleComments = comments
    .map((comment) => ({ ...comment, text: comment.text.trim() }))
    .filter((comment) => comment.text.length > 0);
  const showSourceLabels = visibleComments.length > 1;

  return (
    <section
      className={styles.root}
      aria-label={heading}
      data-viewer-comment-panel
      data-viewer-comments
    >
      <div className={styles.heading}>
        <MessageSquareQuote size={16} strokeWidth={1.8} aria-hidden />
        <h2>{heading}</h2>
      </div>

      {visibleComments.length ? (
        <div className={styles.body} data-inspector-scroll="true">
          {visibleComments.map((comment, index) => (
            <div className={styles.comment} key={`${comment.label ?? "comment"}-${index}`}>
              {showSourceLabels && comment.label ? (
                <p className={styles.source}>{comment.label}</p>
              ) : null}
              <p className={styles.text}>{comment.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>남긴 코멘트가 없습니다.</p>
      )}
    </section>
  );
}
