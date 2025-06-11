import { OctahedralImpostorStandardMaterial, OctahedralImpostorMaterial } from '../core/octahedralImpostorMaterial.js';
import { createAtlasTexture, CreateTextureAtlasParams } from '../utils/createTextureAtlas.js';

export interface OctahedralImpostorParams extends CreateTextureAtlasParams {
  transparent?: boolean;
  parallaxScale?: number;
  alphaClamp?: number;
  // opaqueBlending?: boolean; TODO
  // borderClamp?: boolean; TODO
}

export function generateOctahedralImpostorMaterial(options: OctahedralImpostorParams): OctahedralImpostorMaterial {
  const atlasTexture = createAtlasTexture(options);
  const albedo = atlasTexture.albedo;
  const normalDepthMap = atlasTexture.normalDepthMap;

  const material = new OctahedralImpostorStandardMaterial({
    map: albedo,
    normalMap: normalDepthMap,
    spritesPerSide: options.spritesPerSide,
    useHemiOctahedron: options.useHemiOctahedron,
    alphaTest: 0.5
  });

  return material;
}

//   public exportAlbedo(renderer: WebGLRenderer, fileName: string): void {
//     if (!this._albedoRT) throw new Error('Cannot export a texture passed as parameter.');
//     exportTextureFromRenderTarget(renderer, this._albedoRT, fileName);
//   }
