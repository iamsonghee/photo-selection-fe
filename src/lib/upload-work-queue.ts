/** FIFO, bounded active work. A waiting task must never hold a network slot. */
export class UploadWorkQueue {
  private active = 0;
  private pending: (() => void)[] = [];
  constructor(private concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid upload concurrency");
  }
  setConcurrency(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid upload concurrency");
    this.concurrency = concurrency;
    this.pump();
  }
  getConcurrency() { return this.concurrency; }
  run<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push(() => {
        this.active++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => {
          this.active--;
          this.pump();
        });
      });
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.concurrency && this.pending.length) this.pending.shift()!();
  }
}

/** 모바일 단일 네트워크 슬롯에서 프리뷰 묶음마다 원본 한 장만 통과시킨다. */
export class MobilePreviewPriorityGate {
  private registeredPreviews = 0;
  private startedOriginals = 0;
  private previewsFinished = false;
  private waiters: (() => void)[] = [];

  constructor(private readonly previewsPerOriginal: number) {
    if (!Number.isInteger(previewsPerOriginal) || previewsPerOriginal < 1) throw new Error("Invalid preview burst");
  }

  recordPreview() {
    this.registeredPreviews++;
    this.releaseWaiters();
  }

  finishPreviews() {
    this.previewsFinished = true;
    this.releaseWaiters();
  }

  async waitForOriginal() {
    while (!this.previewsFinished && this.registeredPreviews < (this.startedOriginals + 1) * this.previewsPerOriginal) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.startedOriginals++;
  }

  private releaseWaiters() {
    this.waiters.splice(0).forEach((resolve) => resolve());
  }
}

export type AdaptiveUploadConcurrencyReport = {
  initial: number;
  current: number;
  minimum: number;
  maximum: number;
  adjustments: number;
  measuredWindows: number;
};

/**
 * 원본 PUT의 실제 처리량으로 다음 작업의 동시 실행 수를 조정한다.
 * 개별 스트림 중앙값 × 현재 동시 수를 회선 전체 처리량의 보수적인 근사치로 사용한다.
 */
export class AdaptiveUploadConcurrency {
  private current: number;
  private readonly initialValue: number;
  private rates: number[] = [];
  private bestAggregateRate = 0;
  private adjustments = 0;
  private measuredWindows = 0;

  constructor(
    initial: number,
    private readonly minimum: number,
    private readonly maximum: number,
    private readonly onChange: (concurrency: number) => void,
  ) {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || maximum < minimum) {
      throw new Error("Invalid adaptive concurrency range");
    }
    this.current = Math.max(minimum, Math.min(maximum, initial));
    this.initialValue = this.current;
  }

  record(bytes: number, durationMs: number, succeeded: boolean) {
    if (!succeeded) {
      this.rates = [];
      this.setCurrent(Math.max(this.minimum, this.current - 1));
      return;
    }
    // 매우 작은/짧은 PUT은 연결 준비 비용과 타이머 오차 비중이 커서 튜닝 표본에서 제외한다.
    if (bytes < 256 * 1024 || durationMs < 500) return;
    this.rates.push(bytes / (durationMs / 1000));
    if (this.rates.length < this.current * 2) return;

    const ordered = this.rates.slice().sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    const median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
    const aggregateRate = median * this.current;
    this.rates = [];
    this.measuredWindows++;

    if (this.bestAggregateRate === 0) {
      this.bestAggregateRate = aggregateRate;
      this.setCurrent(Math.min(this.maximum, this.current + 1));
      return;
    }
    if (aggregateRate >= this.bestAggregateRate * 1.05) {
      this.bestAggregateRate = aggregateRate;
      this.setCurrent(Math.min(this.maximum, this.current + 1));
    } else if (aggregateRate < this.bestAggregateRate * 0.85) {
      this.setCurrent(Math.max(this.minimum, this.current - 1));
    }
  }

  report(): AdaptiveUploadConcurrencyReport {
    return {
      initial: this.initialValue,
      current: this.current,
      minimum: this.minimum,
      maximum: this.maximum,
      adjustments: this.adjustments,
      measuredWindows: this.measuredWindows,
    };
  }

  private setCurrent(next: number) {
    if (next === this.current) return;
    this.current = next;
    this.adjustments++;
    this.onChange(next);
  }
}

export function uploadDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

// Keep 1600px input for a 1200px server preview (oversampling margin); delivery originals are untouched.
export const UPLOAD_INTERMEDIATE_MAX_EDGE = 1600;
export const UPLOAD_INTERMEDIATE_JPEG_QUALITY = 0.82;
