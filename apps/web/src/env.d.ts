/// <reference types="next" />
/// <reference types="next/image-types/global" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_INTERNAL_URL?: string;
    readonly NEXT_PUBLIC_WS_URL?: string;
  }
}
