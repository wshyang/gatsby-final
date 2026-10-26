import * as THREE from "three";
import { CITY_GROUND } from "./cityLayout";

/** Shared fog: exp^2 distance fog plus low ground mist. */
export const fogChunk = /* glsl */ `
uniform vec3 uFog;
uniform float uDensity;
vec3 applyFog(vec3 col, vec3 wp, vec3 cam) {
  float d = length(wp - cam);
  float f = 1.0 - exp(-pow(d * uDensity, 2.0));
  float mist = exp(-max(wp.y - ${CITY_GROUND.toFixed(1)}, 0.0) / 38.0) * 0.55 * smoothstep(150.0, 900.0, d);
  f = clamp(f + (1.0 - f) * mist, 0.0, 1.0);
  return mix(col, uFog, f);
}
`;

export interface FogUniforms {
  [uniform: string]: THREE.IUniform;
  uFog: { value: THREE.Color };
  uDensity: { value: number };
}

export function fogUniforms(fog: THREE.Color): FogUniforms {
  return { uFog: { value: fog }, uDensity: { value: 0.00062 } };
}

const worldVert = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

export function groundMaterial(fog: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: fogUniforms(fog),
    vertexShader: worldVert,
    fragmentShader: /* glsl */ `${fogChunk} varying vec3 vW;
      void main(){
        vec2 g = abs(fract(vW.xz / vec2(260.0, 80.0)) - 0.5);
        float street = step(0.47, max(g.x * 1.0, g.y));
        vec3 col = mix(vec3(0.075, 0.08, 0.08), vec3(0.16, 0.17, 0.17), street);
        gl_FragColor = vec4(applyFog(col, vW, cameraPosition), 1.0);
      }`,
  });
}

export function buildingMaterial(fog: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: fogUniforms(fog),
    vertexShader: /* glsl */ `
      attribute float aTint;
      varying vec3 vW; varying vec3 vN; varying float vTint; varying float vH;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(instanceMatrix) * normal); vTint = aTint; vH = position.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `${fogChunk}
      varying vec3 vW; varying vec3 vN; varying float vTint; varying float vH;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        vec3 n = normalize(vN);
        vec3 base = vec3(0.24, 0.25, 0.25) * (0.6 + vTint);
        base *= mix(vec3(1.0), vec3(1.08, 0.98, 0.9), step(0.4, vTint));   // brownstone vs limestone
        float sky = 0.55 + 0.45 * n.y;
        float sun = max(dot(n, normalize(vec3(-0.5, 0.65, 0.45))), 0.0);
        vec3 col = base * (0.42 * sky + 0.55 * sun);
        if (n.y > 0.5) {
          float fr = hash(floor(vW.xz / 7.0));
          col = mix(col, vec3(0.44, 0.47, 0.48) * (0.75 + 0.35 * vTint), 0.4);   // frosty roofs, as in the film
          col *= 0.82 + 0.25 * fr;                                              // roof clutter / tar patches
          vec2 e = abs(fract(vW.xz / vec2(9.0, 11.0)) - 0.5);
          col *= 0.9 + 0.1 * step(0.45, max(e.x, e.y));
        } else {
          float u = abs(n.x) > 0.5 ? vW.z : vW.x;
          vec2 cell = vec2(u / 3.4, vW.y / 3.7);
          float win = step(0.35, fract(cell.x)) * step(0.4, fract(cell.y));
          col *= 1.0 - 0.3 * win;
          float lit = step(0.975, hash(floor(cell))) * win;
          col += vec3(0.9, 0.7, 0.45) * lit * 0.35;
          col *= 0.75 + 0.25 * smoothstep(0.0, 0.3, vH);   // darker at street level
        }
        gl_FragColor = vec4(applyFog(col, vW, cameraPosition), 1.0);
      }`,
  });
}

export function stoneMaterial(fog: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: fogUniforms(fog),
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `${fogChunk} varying vec3 vW; varying vec3 vN; void main(){ float l = 0.45 + 0.4*max(dot(normalize(vN), normalize(vec3(-0.5,0.65,0.45))),0.); gl_FragColor = vec4(applyFog(vec3(0.27,0.25,0.23)*l*1.4, vW, cameraPosition),1.); }`,
  });
}

export function waterMaterial(fog: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...fogUniforms(fog), uTime: { value: 0 } },
    vertexShader: worldVert,
    fragmentShader: /* glsl */ `${fogChunk}
      uniform float uTime; varying vec3 vW;
      float n2(vec2 p){ return sin(p.x)*sin(p.y); }
      void main(){
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(v.y, 0.0), 4.0);
        float rip = n2(vW.xz * vec2(0.05, 0.11) + uTime * 0.3) * 0.5 + n2(vW.xz * vec2(0.13, 0.04) - uTime * 0.2) * 0.5;
        vec3 col = mix(vec3(0.07, 0.1, 0.11), vec3(0.38, 0.44, 0.47), clamp(fres + rip * 0.06, 0.0, 1.0));
        gl_FragColor = vec4(applyFog(col, vW, cameraPosition), 1.0);
      }`,
  });
}

export function paintingMaterial(fog: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uFog: { value: fog } },
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uFog; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(uMap, vUv).rgb;
        // desaturate toward the film's cold teal and sink the lower half into the fog
        float l = dot(c, vec3(0.3, 0.55, 0.15));
        c = mix(vec3(l), c, 0.55) * vec3(0.92, 1.0, 1.04);
        c = mix(c, uFog, 0.35 + 0.5 * (1.0 - smoothstep(0.3, 0.62, vUv.y)));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}
