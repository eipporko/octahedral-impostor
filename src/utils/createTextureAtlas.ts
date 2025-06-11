import { NoColorSpace, Object3D, OrthographicCamera, Sphere, Vector2, Vector4, WebGLRenderer, WebGLRenderTarget, Texture, LinearFilter, NearestFilter, UnsignedByteType, SRGBColorSpace, RGBAFormat, FloatType, ShaderMaterial, UniformsUtils, DoubleSide, GLSL3 } from 'three';
import { computeObjectBoundingSphere } from './computeObjectBoundingSphere.js';
import { hemiOctaGridToDir, octaGridToDir } from './octahedronUtils.js';

import vertexShader from '../shaders/atlas_texture/octahedral_atlas_vertex.glsl';
import fragmentShader from '../shaders/atlas_texture/octahedral_atlas_fragment.glsl';

// TODO: convert to MeshBasicMaterial or create custoom shader
// TODO: fix empty pixel? (example 2048 / 6 = 341.33 pixel) set clear color
// TODO: rename parameters
// TODO: handle transparency if no clear color?
// TODO: pack depth in the alpha channel?
// TODO: use ColorRapresentation instead of Color

type OldRendererData = { renderTarget: WebGLRenderTarget; oldPixelRatio: number; oldScissorTest: boolean; oldClearAlpha: number };

/**
 * Parameters used to generate a texture atlas from a 3D object.
 * The atlas is created by rendering multiple views of the object arranged in a grid.
 */
export interface CreateTextureAtlasParams {
  /**
   * The WebGL renderer used to render the object from multiple directions.
   */
  renderer: WebGLRenderer;
  /**
   * Whether to use a hemispherical octahedral projection instead of a full octahedral one.
   * Use this to generate views covering only the upper hemisphere of the object.
   */
  useHemiOctahedron: boolean;
  /**
   * The 3D object to render from multiple directions.
   * Typically a `Mesh`, `Group`, or any `Object3D` hierarchy.
   */
  target: Object3D;
  /**
   * The full size (in pixels) of the resulting square texture atlas.
   * For example, 2048 will result in a 2048×2048 texture.
   * @default 2048
   */
  textureSize?: number;
  /**
   * Number of sprite cells per side of the atlas grid.
   * For example, 16 will result in 16×16 = 256 unique views.
   * @default 16
   */
  spritesPerSide?: number;
  /**
   * A multiplier applied to the camera's distance from the object's bounding sphere.
   * Controls how far the camera is placed from the object when rendering each view.
   * @default 1
   */
  cameraFactor?: number;
}


export interface TextureAtlas {
  /**
   * The albedo texture containing the rendered views of the object.
   * Each sprite cell contains a unique view from a different direction.
   */
  albedo: Texture;
  /**
   * The normal and depth map texture.
   * Contains normals and depth information for each sprite cell.
   * This can be used for lighting and depth effects.
   */
  normalDepthMap: Texture;
}

const camera = new OrthographicCamera();
const bSphere = new Sphere();
const oldScissor = new Vector4();
const oldViewport = new Vector4();
const coords = new Vector2();

export function createAtlasTexture(params: CreateTextureAtlasParams): TextureAtlas {
  return createAtlas(params);
}

function createAtlas(params: CreateTextureAtlasParams, onBeforeRender?: () => void, onAfterRender?: () => void): TextureAtlas {
  const { renderer, target, useHemiOctahedron } = params;

  if (!renderer) throw new Error('"renderer" is mandatory.');
  if (!target) throw new Error('"target" is mandatory.');
  if (useHemiOctahedron == null) throw new Error('"useHemiOctahedron" is mandatory.');

  const atlasSize = params.textureSize ?? 2048;
  const countPerSide = params.spritesPerSide ?? 16;
  const countPerSideMinusOne = countPerSide - 1;
  const spriteSize = atlasSize / countPerSide;

  computeObjectBoundingSphere(target, bSphere, true);

  const cameraFactor = params.cameraFactor ?? 1;
  updateCamera();

  const { renderTarget, oldPixelRatio, oldScissorTest, oldClearAlpha } = setupRenderer();
  overrideTargetMaterial(target);
  if (onBeforeRender) onBeforeRender();

  for (let row = 0; row < countPerSide; row++) {
    for (let col = 0; col < countPerSide; col++) {
      renderView(col, row);
    }
  }

  if (onAfterRender) onAfterRender();
  restoreRenderer();
  restoreTargetMaterial(target);

  return {
    albedo: renderTarget.textures[0],
    normalDepthMap: renderTarget.textures[1]
  };


  function overrideTargetMaterial(target: Object3D): void {
    target.traverse((child) => {
      const mesh = child as any;
      if (mesh.material) {
        const original = mesh.material;

        mesh.userData._wasMultiMaterial = Array.isArray(original);
        mesh.userData._originalMaterial = original;


        const originalsArray = Array.isArray(original) ? original : [original];
        const uniformsArr = originalsArray.map((mat: any) => {
          const u = UniformsUtils.clone({ 'u_albedo_tex': { value: null } });
          u['u_albedo_tex'].value = mat.map;
          return u;
        });

        const shaderMats = uniformsArr.map((u: any) => {
          return new ShaderMaterial({
            uniforms: u,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: DoubleSide,
            glslVersion: GLSL3,
            transparent: false,
            depthWrite: true,
            alphaTest: 0.5
          });
        });

        mesh.material = Array.isArray(original)
          ? shaderMats
          : shaderMats[0];
      }
    });
  }



  function restoreTargetMaterial(target: Object3D): void {
    target.traverse((child) => {
      const mesh = child as any;
      if (mesh.userData._originalMaterial !== undefined) {

        if (mesh.userData._wasMultiMaterial) {
          mesh.material = mesh.userData._originalMaterial as any[];
        } else {
          mesh.material = mesh.userData._originalMaterial as any;
        }

        delete mesh.userData._originalMaterial;
        delete mesh.userData._wasMultiMaterial;
      }
    });
  }


  function renderView(col: number, row: number): void {
    coords.set(col / (countPerSideMinusOne), row / (countPerSideMinusOne));

    if (useHemiOctahedron) hemiOctaGridToDir(coords, camera.position);
    else octaGridToDir(coords, camera.position);

    camera.position.setLength(bSphere.radius * cameraFactor).add(bSphere.center);
    camera.lookAt(bSphere.center);

    const xOffset = (col / countPerSide) * atlasSize;
    const yOffset = (row / countPerSide) * atlasSize;
    renderer.setViewport(xOffset, yOffset, spriteSize, spriteSize);
    renderer.setScissor(xOffset, yOffset, spriteSize, spriteSize);
    renderer.render(target, camera);
  }


  function updateCamera(): void {
    camera.left = -bSphere.radius;
    camera.right = bSphere.radius;
    camera.top = bSphere.radius;
    camera.bottom = -bSphere.radius;

    camera.zoom = cameraFactor;
    camera.near = 0.001;
    camera.far = bSphere.radius * 2 + 0.001;

    camera.updateProjectionMatrix();
  }


  function setupRenderer(): OldRendererData {
    const oldPixelRatio = renderer.getPixelRatio();
    const oldScissorTest = renderer.getScissorTest();
    const oldClearAlpha = renderer.getClearAlpha();
    renderer.getScissor(oldScissor);
    renderer.getViewport(oldViewport);

    const renderTarget = new WebGLRenderTarget(atlasSize, atlasSize, { colorSpace: NoColorSpace, count: 2 }); // TODO confirm these parameters and reuse same renderTarget

    const ALBEDO = 0;
    const NORMAL_DEPTH = 1;
    renderTarget.textures[ALBEDO].minFilter = LinearFilter;
    renderTarget.textures[ALBEDO].magFilter = LinearFilter;
    renderTarget.textures[ALBEDO].generateMipmaps = true;
    renderTarget.textures[ALBEDO].type = UnsignedByteType;
    renderTarget.textures[ALBEDO].format = RGBAFormat;
    renderTarget.textures[ALBEDO].colorSpace = SRGBColorSpace;

    renderTarget.textures[NORMAL_DEPTH].minFilter = NearestFilter;
    renderTarget.textures[NORMAL_DEPTH].magFilter = NearestFilter;
    renderTarget.textures[NORMAL_DEPTH].generateMipmaps = false;
    renderTarget.textures[NORMAL_DEPTH].type = FloatType;
    renderTarget.textures[NORMAL_DEPTH].format = RGBAFormat;

    renderer.setRenderTarget(renderTarget);
    renderer.setScissorTest(true);
    renderer.setPixelRatio(1);
    renderer.setClearAlpha(0);

    return { renderTarget, oldPixelRatio, oldScissorTest, oldClearAlpha };
  }

  function restoreRenderer(): void {
    renderer.setRenderTarget(null);
    renderer.setScissorTest(oldScissorTest);
    renderer.setViewport(oldViewport.x, oldViewport.y, oldViewport.z, oldViewport.w);
    renderer.setScissor(oldScissor.x, oldScissor.y, oldScissor.z, oldScissor.w);
    renderer.setPixelRatio(oldPixelRatio);
    renderer.setClearAlpha(oldClearAlpha);
  }

}