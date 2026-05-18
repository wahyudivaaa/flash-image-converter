declare module "imagetracerjs" {
  interface ImageTracerOptions {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    rightangleenhance?: boolean;
    colorsampling?: 0 | 1 | 2;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: 0 | 1;
    strokewidth?: number;
    linefilter?: boolean;
    scale?: number;
    roundcoords?: number;
    viewbox?: boolean;
    desc?: boolean;
    blurradius?: number;
    blurdelta?: number;
  }

  interface ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  function imagedataToSVG(imageData: ImageData, options?: ImageTracerOptions): string;

  const _default: {
    imagedataToSVG: typeof imagedataToSVG;
  };
  export default _default;
  export { imagedataToSVG };
}
