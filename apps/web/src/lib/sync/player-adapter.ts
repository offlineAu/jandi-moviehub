/** Common transport surface; embed adapters never expose a cross-origin DOM. */
export interface PlaybackAdapter {
  readonly readyState: number;
  readonly paused: boolean;
  currentTime: number;
  playbackRate: number;
  readonly supportsRate: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(name: string, callback: EventListener): void;
  removeEventListener(name: string, callback: EventListener): void;
}

export class NativePlayerAdapter implements PlaybackAdapter {
  readonly supportsRate = true;
  constructor(private readonly video: HTMLVideoElement) {}
  get readyState() {
    return this.video.readyState;
  }
  get paused() {
    return this.video.paused;
  }
  get currentTime() {
    return this.video.currentTime;
  }
  set currentTime(value: number) {
    this.video.currentTime = value;
  }
  get playbackRate() {
    return this.video.playbackRate;
  }
  set playbackRate(value: number) {
    this.video.playbackRate = value;
  }
  play() {
    return this.video.play();
  }
  pause() {
    this.video.pause();
  }
  addEventListener(name: string, callback: EventListener) {
    this.video.addEventListener(name, callback);
  }
  removeEventListener(name: string, callback: EventListener) {
    this.video.removeEventListener(name, callback);
  }
}
