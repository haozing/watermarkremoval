/// <reference types="vite/client" />

declare module 'react-dom/client'

interface Navigator {
  gpu?: {
    requestAdapter(): Promise<any>
  }
}

// ONNX Runtime global type declarations
declare global {
  var ort: {
    env: {
      wasm: {
        wasmPaths?: string;
        numThreads?: number;
        simd?: boolean;
        proxy?: boolean;
      };
      webgpu?: {
        profilingMode?: string;
      };
      debug?: boolean;
      logLevel?: string;
    };
    InferenceSession: {
      create(model: ArrayBuffer | string, options?: {
        executionProviders?: string[];
      }): Promise<{
        inputNames: string[];
        outputNames: string[];
        run(feeds: Record<string, any>): Promise<Record<string, any>>;
      }>;
    };
    Tensor: new (
      type: string,
      data: Uint8Array | Float32Array,
      dims: number[]
    ) => {
      data: Uint8Array | Float32Array;
      dims: number[];
      type: string;
    };
  };
}

// OpenCV.js type declarations
declare const cv: {
  imread(source: HTMLImageElement | HTMLCanvasElement | string): any;
  imshow(canvasId: string, mat: any): void;
  split(src: any, mv: any): void;
  cvtColor(src: any, dst: any, code: number): void;
  MatVector: new () => any;
  Mat: new () => any;
  COLOR_RGBA2RGB: number;
  COLOR_BGR2GRAY: number;
};

declare module 'opencv-ts' {
  interface Mat {
    rows: number;
    cols: number;
    data: Uint8Array;
    isDeleted(): boolean;
    delete(): void;
  }

  interface MatVector {
    size(): number;
    get(index: number): Mat;
    delete(): void;
  }

  const cv: {
    imread(source: HTMLImageElement | HTMLCanvasElement | string): Mat;
    imshow(canvasId: string, mat: Mat): void;
    split(src: Mat, mv: MatVector): void;
    cvtColor(src: Mat, dst: Mat, code: number): void;
    MatVector: new () => MatVector;
    Mat: new () => Mat;
    COLOR_RGBA2RGB: number;
    COLOR_BGR2GRAY: number;
  };

  export = cv;
}

// Image processing types
interface ImageProcessingCapabilities {
  webgpu: boolean;
  threads: boolean;
  simd: boolean;
}

interface ProcessingProgress {
  close(): void;
}

// OffscreenCanvas type declarations
declare class OffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number);
  getContext(contextType: '2d'): OffscreenCanvasRenderingContext2D | null;
}

declare class OffscreenCanvasRenderingContext2D {
  clearRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: any, dx: number, dy: number): void;
}
