import {
  IUniform, Material, MeshPhongMaterial, MeshStandardMaterial,
  MeshPhysicalMaterial, MeshBasicMaterial,
  MeshBasicMaterialParameters, MeshPhongMaterialParameters,
  MeshStandardMaterialParameters, MeshPhysicalMaterialParameters,
  WebGLRenderer, WebGLProgramParametersWithUniforms
} from 'three';

import shaderChunkParamsVertex from '../shaders/impostor/octahedral_impostor_shader_params_vertex.glsl';
import shaderChunkVertex from '../shaders/impostor/octahedral_impostor_shader_vertex.glsl';
import shaderChunkParamsFragment from '../shaders/impostor/octahedral_impostor_shader_params_fragment.glsl';
import shaderChunkMapFragment from '../shaders/impostor/octahedral_impostor_shader_map_fragment.glsl';
import shaderChunkNormalFragmentBegin from '../shaders/impostor/octahedral_impostor_shader_normal_fragment_begin.glsl';

export type OctahedralImpostorDefines = 'EZ_USE_HEMI_OCTAHEDRON';
export type UniformValue<T> = T extends IUniform<infer U> ? U : never;

export interface OctahedralImpostorUniforms {
  u_sprites_per_side: IUniform<number>;
}

export interface OctahedralImpostorMaterialParameters {
  spritesPerSide?: number;
  useHemiOctahedron?: boolean;
  isOctahedralImpostorMaterial?: boolean;
}


type MaterialConstructor<T extends Material = Material> = new (...args: any[]) => T;

type OctahedralBasicMaterialParameters = MeshBasicMaterialParameters & OctahedralImpostorMaterialParameters;
type OctahedralPhongMaterialParameters = MeshPhongMaterialParameters & OctahedralImpostorMaterialParameters;
type OctahedralStandardMaterialParameters = MeshStandardMaterialParameters & OctahedralImpostorMaterialParameters;
type OctahedralPhysicalMaterialParameters = MeshPhysicalMaterialParameters & OctahedralImpostorMaterialParameters;

function createOctahedralImpostorPatchedMaterial<
  T extends MaterialConstructor,
  U extends OctahedralImpostorMaterialParameters & ConstructorParameters<T>[0]
>(BaseMaterial: T): MaterialConstructor<InstanceType<T>> & { new(params?: U): InstanceType<T> } {

  class PatchedMaterial extends BaseMaterial {
    //public override readonly type = 'OctahedralImpostorMaterial';
    public readonly baseName = BaseMaterial.name;
    public readonly isOctahedralImpostorMaterial = true;
    private _octahedralUniforms: OctahedralImpostorUniforms & { [key: string]: IUniform };
    private _octahedralDefines: { [key: string]: string };
    private _originalOnBeforeCompile?: (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void;

    public set spritesPerSide(value: number) {
      this.setUniform('u_sprites_per_side', value);
    }

    public get spritesPerSide(): number {
      return this._octahedralUniforms.u_sprites_per_side.value;
    }

    public set useHemiOctahedron(value: boolean) {
      if (value) {
        this._octahedralDefines['EZ_USE_HEMI_OCTAHEDRON'] = '';
      } else {
        delete this._octahedralDefines['EZ_USE_HEMI_OCTAHEDRON'];
      }
      this.needsUpdate = true;
    }

    public get useHemiOctahedron(): boolean {
      return 'EZ_USE_HEMI_OCTAHEDRON' in this._octahedralDefines;
    }

    constructor(...args: any[]) {
      const parameters: U | undefined = args[0];

      const useHemiOctahedron = parameters?.useHemiOctahedron ?? false;
      const spritesPerSide = parameters?.spritesPerSide ?? 16;

      const baseParameters = { ...parameters };
      delete baseParameters.useHemiOctahedron;
      delete baseParameters.spritesPerSide;

      super(baseParameters);

      this._originalOnBeforeCompile = this.onBeforeCompile;

      this._octahedralDefines = {};
      this._octahedralUniforms = {
        'u_sprites_per_side': { value: spritesPerSide }
      };

      this.useHemiOctahedron = useHemiOctahedron;
      this.spritesPerSide = spritesPerSide;

      this.onBeforeCompile = (shader, renderer) => {

        shader.defines = Object.assign({}, shader.defines, this._octahedralDefines);

        shader.uniforms = {
          ...shader.uniforms,
          ...this._octahedralUniforms
        };


        shader.vertexShader = shader.vertexShader
          .replace('#include <clipping_planes_pars_vertex>', shaderChunkParamsVertex)
          .replace('#include <shadowmap_vertex>', shaderChunkVertex);


        shader.fragmentShader = shader.fragmentShader
          .replace('#include <clipping_planes_pars_fragment>', shaderChunkParamsFragment)
          .replace('#include <normal_fragment_begin>', shaderChunkNormalFragmentBegin)
          .replace('#include <normal_fragment_maps>', '// #include <normal_fragment_maps>')
          .replace('#include <map_fragment>', shaderChunkMapFragment);


        if (this._originalOnBeforeCompile) {
          this._originalOnBeforeCompile.call(this, shader, renderer);
        }

      };

      this.customProgramCacheKey = () => {
        const base = this.type;
        const defs = Object.keys(this._octahedralDefines).sort().join(',');
        return `octahedralImpostor|${base}|${defs}`;
      };
    }

    protected setUniform<T extends keyof OctahedralImpostorUniforms>(
      key: T,
      value: UniformValue<OctahedralImpostorUniforms[T]>
    ): void {
      if (!this._octahedralUniforms) return;

      if (!(key in this._octahedralUniforms)) {
        this._octahedralUniforms[key] = { value } as IUniform;
      } else {
        this._octahedralUniforms[key].value = value;
      }
    }

    public override clone(): this {
      const cloned = super.clone();

      if (cloned instanceof PatchedMaterial) {
        cloned.spritesPerSide = this.spritesPerSide;
        cloned.useHemiOctahedron = this.useHemiOctahedron;
      }

      return cloned;
    }
  };

  return PatchedMaterial as any;
}

export const OctahedralImpostorBasicMaterial = createOctahedralImpostorPatchedMaterial<typeof MeshBasicMaterial, OctahedralBasicMaterialParameters>(MeshBasicMaterial);
export const OctahedralImpostorPhongMaterial = createOctahedralImpostorPatchedMaterial<typeof MeshPhongMaterial, OctahedralPhongMaterialParameters>(MeshPhongMaterial);
export const OctahedralImpostorStandardMaterial = createOctahedralImpostorPatchedMaterial<typeof MeshStandardMaterial, OctahedralStandardMaterialParameters>(MeshStandardMaterial);
export const OctahedralImpostorPhysicalMaterial = createOctahedralImpostorPatchedMaterial<typeof MeshPhysicalMaterial, OctahedralPhysicalMaterialParameters>(MeshPhysicalMaterial);

export type OctahedralImpostorMaterial =
  | InstanceType<typeof OctahedralImpostorBasicMaterial>
  | InstanceType<typeof OctahedralImpostorPhongMaterial>
  | InstanceType<typeof OctahedralImpostorStandardMaterial>
  | InstanceType<typeof OctahedralImpostorPhysicalMaterial>;